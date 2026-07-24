package com.rhozly.wear.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.Supabase
import com.rhozly.wear.data.TasksRepository
import com.rhozly.wear.data.local.OfflineStore
import com.rhozly.wear.data.notifications.NotificationHelper
import io.github.jan.supabase.auth.auth
import java.time.LocalDate

/**
 * Posts the daily "N tasks today" summary. Counts today's still-to-do tasks
 * (not Completed/Skipped) for the active home — fresh if online, else the cache.
 * Scheduled daily in the morning (SyncScheduler.scheduleDailyNotification).
 */
class NotificationWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (!Supabase.isConfigured) return Result.success()
        runCatching { Supabase.client.auth.currentUserOrNull()?.id }.getOrNull() ?: return Result.success()

        val todayStr = LocalDate.now().toString()
        if (Prefs.lastNotifiedDate == todayStr) return Result.success() // already notified today

        val home = Prefs.selectedHomeId
            ?: runCatching { TasksRepository.activeHomeId() }.getOrNull()
            ?: return Result.success()

        val tasks = runCatching { TasksRepository.dayTasks(home, todayStr, todayStr).tasks }.getOrNull()
            ?: OfflineStore.cachedDay(home, todayStr)
            ?: return Result.success()

        val count = tasks.count { it.status != "Completed" && it.status != "Skipped" }
        // Only record "notified today" if it actually posted (permission granted),
        // so a first-launch permission prompt doesn't suppress it forever.
        if (NotificationHelper.postTodaySummary(applicationContext, count)) {
            Prefs.lastNotifiedDate = todayStr
        }
        return Result.success()
    }
}
