package com.rhozly.wear.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** Schedules the offline cache sync (SyncWorker) + the daily task notification. */
object SyncScheduler {
    private const val PERIODIC = "wear-sync-periodic"
    private const val NOW = "wear-sync-now"
    private const val DAILY_NOTIF = "wear-daily-notif"

    private val netConstraint = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /** Recurring background sync — runs whenever the watch has network, so the
     *  cache is warm before you even open the app. */
    fun schedulePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(4, TimeUnit.HOURS)
            .setConstraints(netConstraint)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Immediate one-off sync (e.g. on app open) — completes even if the app closes. */
    fun syncNow(context: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(netConstraint)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
    }

    /** Daily "N tasks today" notification, fired each morning (~7am). No network
     *  constraint — it falls back to the cache if offline. */
    fun scheduleDailyNotification(context: Context) {
        val req = PeriodicWorkRequestBuilder<NotificationWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(delayToNextMorning(), TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(DAILY_NOTIF, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    /** Fire the daily notification check now (on app open) — the worker itself
     *  caps it to once per day, so this is a fallback if the morning run was missed. */
    fun notifyNow(context: Context) {
        val req = OneTimeWorkRequestBuilder<NotificationWorker>().build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("wear-notify-now", ExistingWorkPolicy.KEEP, req)
    }

    private fun delayToNextMorning(): Long {
        val now = java.time.ZonedDateTime.now()
        var next = now.withHour(7).withMinute(0).withSecond(0).withNano(0)
        if (!next.isAfter(now)) next = next.plusDays(1)
        return java.time.Duration.between(now, next).toMillis()
    }
}
