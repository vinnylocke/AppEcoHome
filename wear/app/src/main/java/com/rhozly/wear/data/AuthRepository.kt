package com.rhozly.wear.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.StateFlow

/** Thin wrapper over supabase-kt Auth. If any call signature differs on the
 *  pinned version, the fixes are localised here. */
object AuthRepository {
    val sessionStatus: StateFlow<SessionStatus>
        get() = Supabase.client.auth.sessionStatus

    suspend fun signIn(email: String, password: String) {
        Supabase.client.auth.signInWith(Email) {
            this.email = email.trim()
            this.password = password
        }
    }

    suspend fun signOut() {
        Supabase.client.auth.signOut()
    }

    fun currentEmail(): String? = Supabase.client.auth.currentUserOrNull()?.email
}
