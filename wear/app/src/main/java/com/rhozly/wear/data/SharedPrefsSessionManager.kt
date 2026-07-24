package com.rhozly.wear.data

import android.content.Context
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persists the Supabase auth session in SharedPreferences so the user stays
 * signed in across app launches (you don't want to re-type a password on a
 * watch every time). UserSession is @Serializable, so we just JSON it in/out.
 *
 * If the supabase-kt SessionManager interface differs on the pinned version,
 * this is the isolated file to adjust — the rest of auth doesn't depend on the
 * internals here.
 */
class SharedPrefsSessionManager(context: Context) : SessionManager {
    private val prefs = context.applicationContext
        .getSharedPreferences("rhozly_wear_auth", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun saveSession(session: UserSession) {
        prefs.edit().putString(KEY, json.encodeToString(session)).apply()
    }

    override suspend fun loadSession(): UserSession? {
        val raw = prefs.getString(KEY, null) ?: return null
        return runCatching { json.decodeFromString<UserSession>(raw) }.getOrNull()
    }

    override suspend fun deleteSession() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val KEY = "session"
    }
}
