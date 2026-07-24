package com.rhozly.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import com.rhozly.wear.data.sync.SyncScheduler
import com.rhozly.wear.presentation.WearApp

/**
 * Single-activity entry point for the Rhozly Wear companion. All UI is Compose
 * for Wear OS; screens are added phase by phase (see docs/wear-os-companion-plan.md).
 */
class MainActivity : ComponentActivity() {

    // Registered at construction (the required lifecycle timing for result APIs).
    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) SyncScheduler.notifyNow(this) // show it now that we're allowed
        }

    private val appUpdateManager by lazy { AppUpdateManagerFactory.create(this) }
    private val updateLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { /* result ignored */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Ask for notification permission (Wear OS 4 / API 33+) so the daily
        // "N tasks today" summary can show.
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        // Warm the offline cache on open + fire the once-a-day task-count notification.
        SyncScheduler.syncNow(this)
        SyncScheduler.notifyNow(this)
        // Auto-update via Google Play (no-op unless installed from Play).
        checkForAppUpdate()
        setContent { WearApp() }
    }

    override fun onResume() {
        super.onResume()
        // Resume an IMMEDIATE update that was interrupted (e.g. the app was backgrounded).
        appUpdateManager.appUpdateInfo.addOnSuccessListener { info ->
            if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                startImmediateUpdate(info)
            }
        }
    }

    /** Check Google Play for a newer build and auto-run an immediate update. Only
     *  does anything when the app was installed from Play (silent no-op otherwise). */
    private fun checkForAppUpdate() {
        appUpdateManager.appUpdateInfo.addOnSuccessListener { info ->
            if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
            ) {
                startImmediateUpdate(info)
            }
        }
    }

    private fun startImmediateUpdate(info: com.google.android.play.core.appupdate.AppUpdateInfo) {
        runCatching {
            appUpdateManager.startUpdateFlowForResult(
                info,
                updateLauncher,
                AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE),
            )
        }
    }
}
