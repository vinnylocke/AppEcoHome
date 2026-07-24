package com.rhozly.wear.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.TimeText
import com.rhozly.wear.data.AuthRepository
import com.rhozly.wear.presentation.auth.AuthViewModel
import com.rhozly.wear.presentation.auth.LoginScreen
import com.rhozly.wear.presentation.tasks.TasksScreen
import com.rhozly.wear.presentation.tasks.TasksViewModel
import com.rhozly.wear.presentation.theme.RhozlyWearTheme
import io.github.jan.supabase.auth.status.SessionStatus

/**
 * Nav host — swaps between the login screen and the (signed-in) home screen
 * based on Supabase's session status. Persisted sessions mean a returning user
 * lands straight on home.
 */
@Composable
fun WearApp() {
    RhozlyWearTheme {
        val vm: AuthViewModel = viewModel()
        val status by AuthRepository.sessionStatus.collectAsState()

        Scaffold(timeText = { TimeText() }) {
            when (status) {
                // A token-refresh failure is almost always just "offline" — the
                // stored session is still valid for cached reads (writes queue /
                // fail gracefully), so show the app instead of a dead spinner.
                is SessionStatus.Authenticated,
                is SessionStatus.RefreshFailure -> {
                    val tasksVm: TasksViewModel = viewModel()
                    TasksScreen(tasksVm, onSignOut = vm::signOut)
                }
                is SessionStatus.NotAuthenticated ->
                    LoginScreen(vm)
                else ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
            }
        }
    }
}
