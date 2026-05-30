package com.cheezy.freedom

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.cheezy.freedom.ui.main.MainScreen
import com.cheezy.freedom.ui.theme.CheezyVPNTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CheezyVPNTheme {
                MainScreen()
            }
        }
    }
}
