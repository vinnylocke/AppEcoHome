package com.rhozly.wear.data

import android.content.Context
import com.rhozly.wear.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

/**
 * The Supabase client, initialised once from the Application (needs a Context
 * for the session store). Auth + Postgrest + Functions + Realtime.
 */
object Supabase {
    @Volatile private var _client: SupabaseClient? = null

    val client: SupabaseClient
        get() = _client ?: error("Supabase.init(context) has not been called")

    fun init(context: Context) {
        if (_client != null) return
        _client = createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
        ) {
            install(Auth) {
                sessionManager = SharedPrefsSessionManager(context)
            }
            install(Postgrest)
            install(Functions)
            install(Realtime)
        }
    }

    /** Host of the configured Supabase URL, or "" if not configured. */
    val configuredHost: String
        get() = BuildConfig.SUPABASE_URL
            .removePrefix("https://")
            .removePrefix("http://")
            .substringBefore("/")

    val isConfigured: Boolean get() = configuredHost.isNotBlank()
}
