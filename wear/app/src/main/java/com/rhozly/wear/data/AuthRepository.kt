package com.rhozly.wear.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialOption
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.rhozly.wear.BuildConfig
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
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

    /**
     * Native "Sign in with Google" for Wear OS. Credential Manager returns a
     * Google ID token, which we hand to Supabase — reusing the exact same Google
     * provider the web/phone app uses (GOOGLE_WEB_CLIENT_ID is the web client id;
     * Supabase's provider has skip_nonce_check = true so no nonce round-trip).
     *
     * Two-step, because Wear OS is fussy:
     *  1. [GetGoogleIdOption] — the streamlined one-tap path (nice for returning
     *     users). On Wear it often throws NoCredentialException even when a Google
     *     account IS on the watch, so we don't rely on it.
     *  2. [GetSignInWithGoogleOption] — the explicit "Sign in with Google" button
     *     flow. Always presents the on-device account picker; this is the correct
     *     option for a user-tapped button and the reliable path on Wear.
     *
     * Needs an Activity [context] because it launches the account-picker UI.
     * Throws on cancel / genuinely-no-credential / unsupported-device — the caller
     * maps those to a friendly message and falls back to email + password.
     */
    suspend fun signInWithGoogle(context: Context) {
        val oneTap = GetGoogleIdOption.Builder()
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .setFilterByAuthorizedAccounts(false) // offer any account, not just previously-used ones
            .setAutoSelectEnabled(false)
            .build()
        try {
            completeGoogleSignIn(context, oneTap)
            return
        } catch (_: NoCredentialException) {
            // Expected on Wear — one-tap found nothing eligible. Fall through to the
            // explicit picker, which enumerates the Google accounts on the device.
        }

        val picker = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
        completeGoogleSignIn(context, picker)
    }

    /** Runs one Credential Manager request and exchanges the Google ID token with Supabase. */
    private suspend fun completeGoogleSignIn(context: Context, option: CredentialOption) {
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        val result = CredentialManager.create(context).getCredential(context, request)
        val credential = result.credential

        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            val googleIdToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
            Supabase.client.auth.signInWith(IDToken) {
                idToken = googleIdToken
                provider = Google
            }
        } else {
            throw IllegalStateException("Unexpected credential type from Google sign-in")
        }
    }

    suspend fun signOut() {
        Supabase.client.auth.signOut()
    }

    fun currentEmail(): String? = Supabase.client.auth.currentUserOrNull()?.email
}
