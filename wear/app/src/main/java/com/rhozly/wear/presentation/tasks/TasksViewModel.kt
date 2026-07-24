package com.rhozly.wear.presentation.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rhozly.wear.data.TasksRepository
import com.rhozly.wear.data.model.MutateResult
import com.rhozly.wear.data.model.WatchTask
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    private suspend fun fetch(date: LocalDate) {
        _ui.value = _ui.value.copy(loading = true, error = null, date = date, isToday = date == today)
        try {
            val home = homeId
                ?: TasksRepository.activeHomeId()?.also { homeId = it }
                ?: throw IllegalStateException("No home set for this account")
            val res = TasksRepository.dayTasks(home, date.toString(), today.toString())
            _ui.value = _ui.value.copy(loading = false, tasks = res.tasks)
        } catch (e: Exception) {
            _ui.value = _ui.value.copy(
                loading = false,
                error = e.message ?: "Couldn't load tasks",
                tasks = emptyList(),
            )
        }
    }
}
