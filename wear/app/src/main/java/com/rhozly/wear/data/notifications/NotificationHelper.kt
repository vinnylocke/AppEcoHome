package com.rhozly.wear.data.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.rhozly.wear.MainActivity
import com.rhozly.wear.R

/** Posts the daily "N tasks today" summary notification. */
object NotificationHelper {
    private const val CHANNEL_ID = "rhozly_daily"
    private const val NOTIF_ID = 1001

    private fun ensureChannel(context: Context) {
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Daily tasks", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "A morning summary of the tasks due today"
                },
            )
        }
    }

    /** @return true if the notification was actually posted (permission granted). */
    fun postTodaySummary(context: Context, count: Int): Boolean {
        if (count <= 0) return false // nothing due — no notification
        ensureChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = if (count == 1) "1 task due today" else "$count tasks due today"
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Rhozly")
            .setContentText(text)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()

        val allowed = Build.VERSION.SDK_INT < 33 ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!allowed) return false
        NotificationManagerCompat.from(context).notify(NOTIF_ID, notification)
        return true
    }
}
