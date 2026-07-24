package com.rhozly.wear

import android.app.Application
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.Supabase

/** Initialises the Supabase client + prefs once, at process start. */
class RhozlyWearApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Supabase.init(this)
        Prefs.init(this)
    }
}
