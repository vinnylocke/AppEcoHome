package com.rhozly.wear.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.Supabase
import com.rhozly.wear.data.TasksRepository
import com.rhozly.wear.data.local.OfflineStore
import com.rhozly.wear.data.local.PendingWriteEntity
import com.rhozly.wear.data.model.WritePayload
import io.github.jan.supabase.auth.auth
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.time.LocalDate

/**
 * Background sync so the watch works offline even before you open the app.
 *   1. Flush the offline write queue (replay complete/postpone/delete/add via
 *      TasksRepository — all idempotent, so re-runs are safe).
 *   2. Warm the read cache: TODAY for every home you belong to (offline home
 *      switcher) + a rolling window (yesterday → +HORIZON days) for the active home.
 * Runs on app open + periodically + when connectivity returns (network-constrained),
 * independent of the app being open.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun doWork(): Result {
        if (!Supabase.isConfigured) return Result.success()
        val userId = runCatching { Supabase.client.auth.currentUserOrNull()?.id }.getOrNull()
            ?: return Result.success() // not signed in — nothing to sync

        val transient = flushQueue(userId)

        // Read-cache warm-up.
        val homes = runCatching { TasksRepository.homes() }.getOrNull()
            ?: return Result.retry() // fetch failed (offline / token) — retry with backoff
        if (homes.isNotEmpty()) {
            OfflineStore.cacheHomes(homes)
            val today = LocalDate.now()
            val todayStr = today.toString()
            val activeId = Prefs.selectedHomeId
            for (h in homes) {
                val offsets = if (h.id == activeId) (-1..HORIZON) else (0..0)
                for (i in offsets) {
                    val d = today.plusDays(i.toLong()).toString()
                    runCatching {
                        val res = TasksRepository.dayTasks(h.id, d, todayStr)
                        OfflineStore.cacheDay(h.id, d, res.tasks)
                    }
                }
            }
        }
        return if (transient) Result.retry() else Result.success()
    }

    /** Replay queued writes in order. Permanent failures are dropped so they can't
     *  wedge the queue; a network failure stops the pass and retries with backoff.
     *  @return true if a transient failure means the worker should retry. */
    private suspend fun flushQueue(currentUserId: String): Boolean {
        for (pw in OfflineStore.pending()) {
            // Never replay another account's write under this session.
            if (pw.userId != null && pw.userId != currentUserId) {
                OfflineStore.deletePending(pw.id)
                continue
            }
            val payload = runCatching { json.decodeFromString<WritePayload>(pw.payloadJson) }.getOrNull()
            if (payload == null) {
                OfflineStore.deletePending(pw.id)
                continue
            }
            val result = runCatching { replay(pw, payload) }
            if (result.isSuccess) {
                OfflineStore.deletePending(pw.id)
                continue
            }
            val e = result.exceptionOrNull()
            when {
                !isNetworkError(e) -> OfflineStore.deletePending(pw.id) // permanent (RLS/constraint/4xx) — drop
                (pw.attempts + 1) >= MAX_ATTEMPTS -> OfflineStore.deletePending(pw.id) // gave up
                else -> {
                    OfflineStore.bumpPending(pw.id, e?.message)
                    return true // transient — stop; retry the worker
                }
            }
        }
        return false
    }

    private suspend fun replay(pw: PendingWriteEntity, p: WritePayload) {
        when (pw.action) {
            "complete" -> p.task?.let { TasksRepository.complete(it, pw.homeId) }
            "postpone" -> if (p.task != null && p.newDate != null) TasksRepository.postpone(p.task, pw.homeId, p.newDate)
            "delete" -> p.task?.let { TasksRepository.deleteTask(it, pw.homeId, p.series) }
            "add" -> if (p.title != null && p.type != null && p.dueDate != null && p.clientId != null) {
                TasksRepository.addTask(pw.homeId, p.title, p.type, p.dueDate, p.description, p.clientId)
            }
        }
    }

    private fun isNetworkError(e: Throwable?): Boolean {
        var t: Throwable? = e
        while (t != null) {
            if (t is java.io.IOException) return true
            t = t.cause
        }
        return false
    }

    companion object {
        const val HORIZON = 13 // today .. +13 → a 2-week window for the active home
        const val MAX_ATTEMPTS = 8
    }
}
