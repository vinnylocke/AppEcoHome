package com.rhozly.wear.presentation.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rhozly.wear.data.Supabase
import com.rhozly.wear.data.TasksRepository
import com.rhozly.wear.data.model.MutateResult
import com.rhozly.wear.data.model.WatchTask
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import java.time.LocalDate

data class TasksUiState(
    val loading: Boolean = true,
    val date: LocalDate = LocalDate.now(),
    val isToday: Boolean = true,
    val tasks: List<WatchTask> = emptyList(),
    val error: String? = null,
    /** Transient toast (a "finish on phone" hint, or an action error). */
    val message: String? = null,
)

class TasksViewModel : ViewModel() {
    private val today: LocalDate = LocalDate.now()
    private val _ui = MutableStateFlow(TasksUiState(date = today, isToday = true))
    val ui: StateFlow<TasksUiState> = _ui.asStateFlow()

    // Cached after the first lookup so day navigation doesn't re-query the home.
    private var homeId: String? = null

    // Live auto-refresh: one channel on the home's tasks, alive while the VM is.
    private var realtimeChannel: RealtimeChannel? = null

    init { load(today) }

    fun goPrevDay() = load(_ui.value.date.minusDays(1))
    fun goNextDay() = load(_ui.value.date.plusDays(1))
    fun goToday() = load(today)
    fun reload() = load(_ui.value.date)
    fun clearMessage() { _ui.value = _ui.value.copy(message = null) }

    // ── Actions ──────────────────────────────────────────────────────────────

    fun complete(task: WatchTask) = act { home -> TasksRepository.complete(task, home) }

    /** Postpone by `days`, anchored at max(due_date, today) so it always moves later. */
    fun postpone(task: WatchTask, days: Int) = act { home ->
        val due = runCatching { LocalDate.parse(task.dueDate) }.getOrDefault(today)
        val base = if (due.isBefore(today)) today else due
        TasksRepository.postpone(task, home, base.plusDays(days.toLong()).toString())
    }

    fun deleteTask(task: WatchTask, series: Boolean) = act { home ->
        TasksRepository.deleteTask(task, home, series)
    }

    private fun act(call: suspend (homeId: String) -> MutateResult) {
        val home = homeId
        if (home == null) {
            _ui.value = _ui.value.copy(message = "No home set for this account")
            return
        }
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, message = null)
            val result = runCatching { call(home) }.getOrNull()
            // Reconcile against server truth either way (also reverts on failure).
            fetch(_ui.value.date)
            _ui.value = _ui.value.copy(
                message = when {
                    result?.ok == true -> result.hint // may be null → no toast
                    else -> result?.error ?: "Couldn't update — try again"
                },
            )
        }
    }

    // ── Loading ──────────────────────────────────────────────────────────────

    private fun load(date: LocalDate) = viewModelScope.launch { fetch(date) }

    /** @param silent a realtime-triggered refresh — don't flash the spinner, and
     *   keep the existing list if it fails (a transient socket hiccup shouldn't
     *   blank the screen). */
    private suspend fun fetch(date: LocalDate, silent: Boolean = false) {
        _ui.value = _ui.value.copy(
            loading = !silent,
            error = if (silent) _ui.value.error else null,
            date = date,
            isToday = date == today,
        )
        try {
            val home = homeId
                ?: TasksRepository.activeHomeId()?.also { homeId = it }
                ?: throw IllegalStateException("No home set for this account")
            startRealtime(home)
            val res = TasksRepository.dayTasks(home, date.toString(), today.toString())
            _ui.value = _ui.value.copy(loading = false, tasks = res.tasks)
        } catch (e: Exception) {
            if (silent) {
                _ui.value = _ui.value.copy(loading = false)
            } else {
                _ui.value = _ui.value.copy(
                    loading = false,
                    error = e.message ?: "Couldn't load tasks",
                    tasks = emptyList(),
                )
            }
        }
    }

    /** Subscribe once to the home's `tasks` changes (RLS-scoped by the user's
     *  session) and silently refetch the viewed day on any change. Debounced so
     *  a burst of writes = one refetch. */
    private fun startRealtime(homeId: String) {
        if (realtimeChannel != null) return
        val ch = Supabase.client.channel("home-tasks-$homeId")
        realtimeChannel = ch
        viewModelScope.launch {
            val changes = ch.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "tasks"
                filter("home_id", FilterOperator.EQ, homeId)
            }
            launch { changes.debounce(300L).collect { fetch(_ui.value.date, silent = true) } }
            ch.subscribe()
        }
    }

    override fun onCleared() {
        super.onCleared()
        val ch = realtimeChannel ?: return
        realtimeChannel = null
        // viewModelScope is already cancelled here; remove on a throwaway scope.
        CoroutineScope(Dispatchers.IO).launch { runCatching { Supabase.client.realtime.removeChannel(ch) } }
    }
}
