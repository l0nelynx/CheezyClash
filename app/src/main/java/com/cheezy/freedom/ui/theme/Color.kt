package com.cheezy.freedom.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

val Purple80 = Color(0xFFD0BCFF)
val PurpleGrey80 = Color(0xFFCCC2DC)
val Pink80 = Color(0xFFEFB8C8)

val Purple40 = Color(0xFF6650a4)
val PurpleGrey40 = Color(0xFF625b71)
val Pink40 = Color(0xFF7D5260)

// Semantic status colours. Material's colorScheme has no success/warning roles,
// so these are defined here with light/dark variants instead of hard-coding a
// single hex at the call site (which loses contrast in the other mode).
val successColor: Color
    @Composable @ReadOnlyComposable
    get() = if (isSystemInDarkTheme()) Color(0xFF81C784) else Color(0xFF2E7D32)

val warningColor: Color
    @Composable @ReadOnlyComposable
    get() = if (isSystemInDarkTheme()) Color(0xFFFFB74D) else Color(0xFFF57C00)