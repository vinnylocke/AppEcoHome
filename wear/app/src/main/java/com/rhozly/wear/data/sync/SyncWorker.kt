package com.rhozly.wear.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.Supabase
import com.rhozly.wear.data.TasksRepository
import com.rhozly.wear.data.local.OfflineStore
import io.github.jan.supabase.auth.auth
import java.time.LocalDate

/**
 * Background sync so the watch works offline even before you open the app.
 * Caches TODAY for every home you belong to (Phase 5 lets you switch home
 * offline) + a rolling window (yesterday → +HORIZON days) for the active home.
 * Runs on app open + periodically (network-constrained). Because it's a
 * WorkManager job it completes independently of the app being open — unlike the
 * old in-app coroutine, which died on close (that's why only one home cached).
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (!Supabase.isConfigured) return Result.success()
        val userId = runCatching { Supabase.client.auth.currentUserOrNull()?.id }.getOrNull()
            ?: return Result.success() // not signed in — nothing to sync

        val homes = runCatching { TasksRepository.homes() }.getOrNull()
            ?: return Result.retry() // fetch failed (offline / token) — try again with backoff
        if (homes.isEmpty()) return Result.success()
        OfflineStore.cacheHomes(homes)

        val today = LocalDate.now()
        val todayStr = today.toString()
        val activeId = Prefs.selectedHomeId
        for (h in homes) {
            val offsets = if (h.id == activeId) (-1..HORIZON) else (0..0)
            for (i in offsets) {
                val d = today.plusDays(i.toLong()).toString()
                // Per-day failures are tolerated; the next run fills any gaps.
                runCatching {
                    val res = TasksRepository.dayTasks(h.id, d, todayStr)
                    OfflineStore.cacheDay(h.id, d, res.tasks)
                }
            }
        }
        return Result.success()
    }

    companion object {
        const val HORIZON = 13 // today .. +13 → a 2-week window for the active home
    }
}
