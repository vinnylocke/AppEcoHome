package com.rhozly.wear.presentation.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.Supabase
import com.rhozly.wear.data.TasksRepository
import com.rhozly.wear.data.model.HomeOption
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
    /** Homes the user belongs to (for the switcher) + the active one. */
    val homes: List<HomeOption> = emptyList(),
    val homeName: String? = null,
    val activeHomeId: String? = null,
)

class TasksViewModel : ViewModel() {
    private val today: LocalDate = LocalDate.now()
    private val _ui = MutableStateFlow(TasksUiState(date = today, isToday = true))
    val ui: StateFlow<TasksUiState> = _ui.asStateFlow()

    // Cached after the first lookup so day navigation doesn't re-query the home.
    private var homeId: String? = null
    private var homesLoaded = false

    // Live auto-refresh: one channel on the home's tasks, alive while the VM is.
    private var realtimeChannel: RealtimeChannel? = null

    init { load(today) }

    /** Switch the watch to another home (local preference — doesn't touch the
     *  phone's active home). Re-scopes the task view + Realtime channel. */
    fun selectHome(id: String) {
        if (id == homeId) return
        Prefs.selectedHomeId = id
        homeId = id
        _ui.value = _ui.value.copy(
            homeName = _ui.value.homes.find { it.id == id }?.name,
            activeHomeId = id,
        )
        // Tear down the old home's Realtime channel; the next fetch re-subscribes.
        realtimeChannel?.let { ch ->
            realtimeChannel = null
            CoroutineScope(Dispatchers.IO).launch { runCatching { Supabase.client.realtime.removeChannel(ch) } }
        }
        load(today)
    }

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

    /** Save a fully-specified new task (from the New-task editor). */
    fun saveNewTask(title: String, type: String, dueDate: String, note: String) {
        val name = title.trim()
        if (name.isEmpty()) {
            _ui.value = _ui.value.copy(message = "Add a task name first")
            return
        }
        act { home -> TasksRepository.addTask(home, name, type, dueDate, note.trim().ifEmpty { null }) }
    }

    /** The day currently on screen (the New-task editor defaults its date to this). */
    fun viewedDateString(): String = _ui.value.date.toString()

    /** Show a transient toast (e.g. "Didn't catch that"). */
    fun flash(message: String) { _ui.value = _ui.value.copy(message = message) }

    private fun act(call: suspend (homeId: String) -> MutateResult) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, message = null)
            // Resolve the home if it's not cached yet — launching the voice activity
            // can recreate this ViewModel, clearing homeId. resolveHome() respects the
            // watch's selected home (not just the phone's active one).
            val home = runCatching { resolveHome() }.getOrNull()
            if (home == null) {
                fetch(_ui.value.date)
                _ui.value = _ui.value.copy(message = "No home set for this account")
                return@launch
            }
            val outcome = runCatching { call(home) }
            // Reconcile against server truth either way (also reverts on failure).
            fetch(_ui.value.date)
            _ui.value = _ui.value.copy(
                message = outcome.fold(
                    onSuccess = { if (it.ok) it.hint else (it.error ?: "Couldn't update — try again") },
                    // Surface the real error (truncated) so a failed write is visible, not silent.
                    onFailure = { it.message?.take(80) ?: "Couldn't update — try again" },
                ),
            )
        }
    }

    // ── Loading ──────────────────────────────────────────────────────────────

    private fun load(date: LocalDate) = viewModelScope.launch { fetch(date) }

    /** Effective home: the watch's local pick, else the phone's active home (then seed the pick). */
    private suspend fun resolveHome(): String? {
        homeId?.let { return it }
        val resolved = Prefs.selectedHomeId ?: TasksRepository.activeHomeId()
        if (resolved != null) {
            homeId = resolved
            if (Prefs.selectedHomeId == null) Prefs.selectedHomeId = resolved
        }
        return resolved
    }

    /** Load the homes list once (for the switcher). Best-effort — never fatal. */
    private suspend fun ensureHomesLoaded() {
        if (homesLoaded) return
        homesLoaded = true
        val list = runCatching { TasksRepository.homes() }.getOrDefault(emptyList())
        _ui.value = _ui.value.copy(
            homes = list,
            homeName = list.find { it.id == homeId }?.name,
            activeHomeId = homeId,
        )
    }

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
            val home = resolveHome() ?: throw IllegalStateException("No home set for this account")
            ensureHomesLoaded()
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
