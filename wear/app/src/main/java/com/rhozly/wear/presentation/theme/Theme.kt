package com.rhozly.wear.presentation.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme

// Rhozly greens on a black watch background (OLED-friendly).
private val RhozlyColors = Colors(
    primary = Color(0xFF4CAF50),
    onPrimary = Color(0xFF002200),
    secondary = Color(0xFF81C784),
    onSecondary = Color(0xFF002200),
    background = Color(0xFF000000),
    onBackground = Color(0xFFFFFFFF),
    surface = Color(0xFF1B1B1B),
    onSurface = Color(0xFFFFFFFF),
    error = Color(0xFFEF5350),
    onError = Color(0xFF000000),
)

@Composable
fun RhozlyWearTheme(content: @Composable () -> Unit) {
    MaterialTheme(colors = RhozlyColors, content = content)
}
