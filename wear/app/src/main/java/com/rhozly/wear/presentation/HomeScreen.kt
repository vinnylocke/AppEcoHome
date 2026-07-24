package com.rhozly.wear.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

/**
 * Phase 1b placeholder — confirms you're signed in. Phase 2 replaces the body
 * with today's task list (from the get-today-tasks edge function).
 */
@Composable
fun HomeScreen(email: String?, onSignOut: () -> Unit) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 28.dp),
    ) {
        item {
            Text(
                "Signed in",
                style = MaterialTheme.typography.title3,
                textAlign = TextAlign.Center,
            )
        }
        email?.let {
            item {
                Text(
                    it,
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        item {
            Text(
                "Your tasks arrive next",
                style = MaterialTheme.typography.caption2,
                color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f),
                textAlign = TextAlign.Center,
            )
        }
        item {
            Chip(
                onClick = onSignOut,
                colors = ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Sign out") },
            )
        }
    }
}
