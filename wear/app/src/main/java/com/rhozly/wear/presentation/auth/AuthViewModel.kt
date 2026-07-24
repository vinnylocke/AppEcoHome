package com.rhozly.wear.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rhozly.wear.data.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
)

class AuthViewModel : ViewModel() {
    private val _ui = MutableStateFlow(LoginUiState())
    val ui: StateFlow<LoginUiState> = _ui.asStateFlow()

    fun onEmail(v: String) { _ui.value = _ui.value.copy(email = v, error = null) }
    fun onPassword(v: String) { _ui.value = _ui.value.copy(password = v, error = null) }

    fun signIn() {
        val s = _ui.value
        if (s.email.isBlank() || s.password.isBlank()) {
            _ui.value = s.copy(error = "Enter email and password")
            return
        }
        _ui.value = s.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                AuthRepository.signIn(s.email, s.password)
                // On success sessionStatus flips to Authenticated → the nav host
                // (WearApp) swaps to the home screen. Clear the password field.
                _ui.value = _ui.value.copy(loading = false, password = "")
            } catch (e: Exception) {
                _ui.value = _ui.value.copy(loading = false, error = e.message ?: "Sign-in failed")
            }
        }
    }

    fun signOut() {
        viewModelScope.launch { runCatching { AuthRepository.signOut() } }
    }
}
