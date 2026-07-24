package com.rhozly.wear.presentation.tasks

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.rhozly.wear.data.ConnectivityMonitor
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.Supabase
import com.rhozly.wear.data.TasksRepository
import com.rhozly.wear.data.local.OfflineStore
import com.rhozly.wear.data.local.PendingWriteEntity
import com.rhozly.wear.data.model.HomeOption
import com.rhozly.wear.data.model.MutateResult
import com.rhozly.wear.data.model.WatchTask
import com.rhozly.wear.data.model.WritePayload
import com.rhozly.wear.data.sync.SyncScheduler
import io.github.jan.supabase.auth.auth
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
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.util.UUID

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
    /** True when the shown list came from the offline cache (fetch failed). */
    val offline: Boolean = false,
    /** Offline AND this day was never cached (so the empty list means "not synced"). */
    val notCached: Boolean = false,
    /** Pending offline writes waiting to sync (the "N queued" chip). */
    val queuedCount: Int = 0,
)

class TasksViewModel(app: Application) : AndroidViewModel(app) {
    private val today: LocalDate = LocalDate.now()
    private val _ui = MutableStateFlow(TasksUiState(date = today, isToday = true))
    val ui: StateFlow<TasksUiState> = _ui.asStateFlow()
    private val json = Json { ignoreUnknownKeys = true }

    // Cached after the first lookup so day navigation doesn't re-query the home.
    private var homeId: String? = null
    private var homesLoaded = false

    // Live auto-refresh: one channel on the home's tasks, alive while the VM is.
    private var realtimeChannel: RealtimeChannel? = null

    init {
        load(today)
        // Reflect the offline write-queue size in the "N queued" chip.
        OfflineStore.pendingCountFlow()
            .onEach { count -> _ui.value = _ui.value.copy(queuedCount = count) }
            .launchIn(viewModelScope)
        // The moment connectivity returns: flush the queue + refetch (reconcile) —
        // instead of waiting for realtime backoff / the periodic worker.
        ConnectivityMonitor.isOnline
            .drop(1) // skip the seeded value; react to transitions
            .onEach { online -> if (online) { SyncScheduler.syncNow(getApplication()); reload() } }
            .launchIn(viewModelScope)
    }

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

    fun complete(task: WatchTask) = mutateOrQueue(
        action = "complete",
        payload = WritePayload(task = task),
        optimistic = { list -> list.map { if (it.id == task.id) it.copy(status = "Completed", overdue = false) else it } },
    ) { home -> TasksRepository.complete(task, home) }

    fun postpone(task: WatchTask, days: Int) {
        val newDate = postponeDate(task, days)
        mutateOrQueue(
            action = "postpone",
            payload = WritePayload(task = task, newDate = newDate),
            optimistic = { list -> list.filterNot { it.id == task.id } }, // moved off this day
        ) { home -> TasksRepository.postpone(task, home, newDate) }
    }

    fun deleteTask(task: WatchTask, series: Boolean) = mutateOrQueue(
        action = "delete",
        payload = WritePayload(task = task, series = series),
        optimistic = { list -> list.filterNot { it.id == task.id } },
    ) { home -> TasksRepository.deleteTask(task, home, series) }

    /** Save a fully-specified new task (from the New-task editor). */
    fun saveNewTask(title: String, type: String, dueDate: String, note: String) {
        val name = title.trim()
        if (name.isEmpty()) {
            _ui.value = _ui.value.copy(message = "Add a task name first")
            return
        }
        val id = UUID.randomUUID().toString() // client id → idempotent replay (upsert)
        val desc = note.trim().ifEmpty { null }
        val optimisticRow = WatchTask(id = id, title = name, type = type, dueDate = dueDate, status = "Pending")
        mutateOrQueue(
            action = "add",
            payload = WritePayload(title = name, type = type, dueDate = dueDate, description = desc, clientId = id),
            optimistic = { list -> if (dueDate == _ui.value.date.toString()) list + optimisticRow else list },
        ) { home -> TasksRepository.addTask(home, name, type, dueDate, desc, id) }
    }

    /** Postpone target date, anchored at max(due_date, today) so it always moves later. */
    private fun postponeDate(task: WatchTask, days: Int): String {
        val due = runCatching { LocalDate.parse(task.dueDate) }.getOrDefault(today)
        val base = if (due.isBefore(today)) today else due
        return base.plusDays(days.toLong()).toString()
    }

    /** The day currently on screen (the New-task editor defaults its date to this). */
    fun viewedDateString(): String = _ui.value.date.toString()

    /** Show a transient toast (e.g. "Didn't catch that"). */
    fun flash(message: String) { _ui.value = _ui.value.copy(message = message) }

    /**
     * Run a write online; on a NETWORK failure apply it optimistically to the
     * local list + cache and queue it for SyncWorker to replay on reconnect.
     * On success, reconcile from the server.
     */
    private fun mutateOrQueue(
        action: String,
        payload: WritePayload,
        optimistic: (List<WatchTask>) -> List<WatchTask>,
        call: suspend (homeId: String) -> MutateResult,
    ) {
        viewModelScope.launch {
            val home = runCatching { resolveHome() }.getOrNull()
            if (home == null) {
                _ui.value = _ui.value.copy(message = "No home set for this account")
                return@launch
            }
            // OFFLINE mode: apply + queue immediately — no network attempt, no spinner.
            if (!ConnectivityMonitor.isOnline.value) {
                queueOffline(action, home, payload, optimistic)
                return@launch
            }
            _ui.value = _ui.value.copy(loading = true, message = null)
            runCatching { call(home) }.fold(
                onSuccess = { res ->
                    fetch(_ui.value.date) // reconcile from server truth
                    _ui.value = _ui.value.copy(message = if (res.ok) res.hint else (res.error ?: "Couldn't update — try again"))
                },
                onFailure = { e ->
                    if (isNetworkError(e)) {
                        queueOffline(action, home, payload, optimistic) // lie-fi — queue it
                    } else {
                        fetch(_ui.value.date)
                        _ui.value = _ui.value.copy(message = e.message?.take(80) ?: "Couldn't update — try again")
                    }
                },
            )
        }
    }

    /** Apply a write locally + persist + queue for replay on reconnect. */
    private suspend fun queueOffline(
        action: String,
        home: String,
        payload: WritePayload,
        optimistic: (List<WatchTask>) -> List<WatchTask>,
    ) {
        val newList = optimistic(_ui.value.tasks)
        _ui.value = _ui.value.copy(loading = false, tasks = newList, offline = true, message = "Queued — will sync")
        runCatching { OfflineStore.cacheDay(home, _ui.value.date.toString(), newList) }
        enqueueWrite(action, home, payload)
        SyncScheduler.syncNow(getApplication())
    }

    private suspend fun enqueueWrite(action: String, home: String, payload: WritePayload) {
        val userId = runCatching { Supabase.client.auth.currentUserOrNull()?.id }.getOrNull()
        OfflineStore.enqueue(
            PendingWriteEntity(
                id = UUID.randomUUID().toString(),
                userId = userId,
                homeId = home,
                action = action,
                payloadJson = json.encodeToString(payload),
                createdAt = System.currentTimeMillis(),
            ),
        )
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

    /** Load the homes list (for the switcher), caching it. Offline → cached list. */
    private suspend fun ensureHomesLoaded() {
        if (homesLoaded) return
        val list = runCatching { TasksRepository.homes() }.getOrNull()
        if (!list.isNullOrEmpty()) {
            homesLoaded = true
            OfflineStore.cacheHomes(list)
            setHomes(list)
        } else if (_ui.value.homes.isEmpty()) {
            setHomes(OfflineStore.cachedHomes()) // offline first paint; retries next fetch
        }
    }

    private fun setHomes(list: List<HomeOption>) {
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
        val online = ConnectivityMonitor.isOnline.value
        _ui.value = _ui.value.copy(
            loading = !silent && online, // no spinner in offline mode — cache is instant
            error = if (silent) _ui.value.error else null,
            date = date,
            isToday = date == today,
        )
        val home = runCatching { resolveHome() }.getOrNull()
        if (home == null) {
            _ui.value =
                if (silent) _ui.value.copy(loading = false)
                else _ui.value.copy(loading = false, error = "No home set for this account", tasks = emptyList())
            return
        }

        // OFFLINE mode: read straight from cache — instant, no network attempt.
        if (!online) {
            val cached = OfflineStore.cachedDay(home, date.toString())
            _ui.value = _ui.value.copy(
                loading = false,
                tasks = cached ?: emptyList(),
                offline = true,
                notCached = cached == null,
                error = null,
            )
            return
        }

        ensureHomesLoaded()
        startRealtime(home)
        try {
            val res = TasksRepository.dayTasks(home, date.toString(), today.toString())
            OfflineStore.cacheDay(home, date.toString(), res.tasks)
            _ui.value = _ui.value.copy(loading = false, tasks = res.tasks, offline = false, notCached = false, error = null)
        } catch (e: Exception) {
            // Online but the call failed (lie-fi / server) → fall back to cache.
            val cached = OfflineStore.cachedDay(home, date.toString())
            val offlineDown = isNetworkError(e)
            _ui.value = when {
                cached != null -> _ui.value.copy(loading = false, tasks = cached, offline = true, notCached = false, error = null)
                offlineDown -> _ui.value.copy(loading = false, tasks = emptyList(), offline = true, notCached = true, error = null)
                silent -> _ui.value.copy(loading = false)
                else -> _ui.value.copy(loading = false, error = e.message ?: "Couldn't load tasks", tasks = emptyList())
            }
        }
    }

    /** Network-shaped failure (host unresolved / connect / timeout — all IOException). */
    private fun isNetworkError(e: Throwable?): Boolean {
        var t: Throwable? = e
        while (t != null) {
            if (t is java.io.IOException) return true
            t = t.cause
        }
        return false
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
