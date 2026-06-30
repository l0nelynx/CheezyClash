package com.cheezy.freedom.account.internal

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.cheezy.freedom.account.AppLaunchers

/**
 * Open version of launchers: none of the proprietary Activities exist,
 * all methods return null. MainScreen sees null and skips the
 * corresponding flow (e.g., for needsAuth, it shows UrlDialog
 * instead of AuthActivity).
 */
class OpenAppLaunchers : AppLaunchers {
    override fun authActivityIntent(context: Context): Intent? = null
    override fun subscriptionActivityIntent(context: Context): Intent? = null
    override fun devicesActivityIntent(context: Context): Intent? = null

    // In the open version, there is no subscription transfer; the dialog does not exist.
    override val TransferSubscriptionDialog = null

    override val ExtraSettingsItems: @Composable (onAddConfig: () -> Unit) -> Unit = { onAddConfig ->
        androidx.compose.material3.ListItem(
            headlineContent = { androidx.compose.material3.Text("Add configuration") },
            leadingContent = {
                androidx.compose.material3.Icon(
                    androidx.compose.material.icons.Icons.Default.Add,
                    null
                )
            },
            colors = androidx.compose.material3.ListItemDefaults.colors(
                containerColor = androidx.compose.ui.graphics.Color.Transparent
            ),
            modifier = Modifier.clickable(onClick = onAddConfig)
        )
    }
}
