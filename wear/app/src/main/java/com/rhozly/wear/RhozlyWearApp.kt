package com.rhozly.wear

import android.app.Application
import com.rhozly.wear.data.Supabase

/** Initialises the Supabase client once, at process start. */
class RhozlyWearApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Supabase.init(this)
    }
}
