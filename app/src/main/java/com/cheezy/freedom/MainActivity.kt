package com.cheezy.freedom

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.cheezy.freedom.ui.main.MainScreen
import com.cheezy.freedom.ui.theme.CheezyVPNTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    // Raw deep-link URI string (cheezy://...) delivered on launch or while the
    // activity is already visible (singleTask → onNewIntent). MainScreen parses
    // and routes it.
    private val deepLink = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        deepLink.value = intent?.dataString
        setContent {
            CheezyVPNTheme {
                MainScreen(deepLinkFlow = deepLink, onDeepLinkHandled = { deepLink.value = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.dataString?.let { deepLink.value = it }
    }
}
