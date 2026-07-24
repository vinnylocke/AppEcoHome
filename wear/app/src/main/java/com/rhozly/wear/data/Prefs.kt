package com.rhozly.wear.data

import android.content.Context

/**
 * Tiny SharedPreferences store for watch-local settings. Currently just the
 * selected home — a LOCAL choice so switching home on the watch doesn't change
 * the phone's active home (`user_profiles.home_id`). Defaults to that on first run.
 */
object Prefs {
    private const val FILE = "rhozly_wear_prefs"
    private const val KEY_HOME = "selected_home_id"

    @Volatile private var sp: android.content.SharedPreferences? = null

    fun init(context: Context) {
        if (sp == null) sp = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    }

    var selectedHomeId: String?
        get() = sp?.getString(KEY_HOME, null)
        set(value) { sp?.edit()?.putString(KEY_HOME, value)?.apply() }
}
