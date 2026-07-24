package com.rhozly.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.rhozly.wear.data.sync.SyncScheduler
import com.rhozly.wear.presentation.WearApp

/**
 * Single-activity entry point for the Rhozly Wear companion. All UI is Compose
 * for Wear OS; screens are added phase by phase (see docs/wear-os-companion-plan.md).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Warm the offline cache on open (background; completes even if we close).
        SyncScheduler.syncNow(this)
        setContent { WearApp() }
    }
}
