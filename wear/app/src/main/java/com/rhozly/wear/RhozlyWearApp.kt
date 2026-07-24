package com.rhozly.wear

import android.app.Application
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.Supabase
import com.rhozly.wear.data.local.OfflineStore
import com.rhozly.wear.data.sync.SyncScheduler

/** Initialises the Supabase client + prefs + local store once, at process start,
 *  and schedules the recurring background cache sync. */
class RhozlyWearApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Supabase.init(this)
        Prefs.init(this)
        OfflineStore.init(this)
        SyncScheduler.schedulePeriodic(this)
    }
}
