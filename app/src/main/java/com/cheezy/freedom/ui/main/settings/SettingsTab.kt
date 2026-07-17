package com.cheezy.freedom.ui.main.settings

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.cheezy.freedom.BuildConfig
import com.cheezy.freedom.R
import com.cheezy.freedom.LogsActivity
import com.cheezy.freedom.UpdateManager
import com.cheezy.freedom.account.AppDeps

@Composable
fun SettingsTab(
    userEmail: String?,
    tgId: Long?,
    isCheckingUpdate: Boolean,
    // Capabilities: if a flavor does not support a feature, the corresponding
    // UI block is not drawn. In open, everything is false; in proprietary,
    // everything is true.
    showAccountCard: Boolean,
    showDevices: Boolean,
    showSubscription: Boolean,
    showTelegramLink: Boolean,
    showLogout: Boolean,
    onAddConfig: () -> Unit,
    onCheckUpdate: () -> Unit,
    onLogout: () -> Unit,
    onOpenSubscription: () -> Unit,
    onOpenDevices: () -> Unit,
    onShareVpn: () -> Unit,
    onUnlinkTelegram: () -> Unit,
    onRequestTransfer: () -> Unit,
    onOpenAccessControl: () -> Unit,
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    var showInfoDialog by remember { mutableStateOf(false) }
    // ListItems default to an opaque `surface` container; on the tab card that
    // reads as white strips. Make them transparent so they take the card colour.
    val transparentList = ListItemDefaults.colors(containerColor = Color.Transparent)

    if (showInfoDialog) AppInfoDialog { showInfoDialog = false }
    // TransferSubscriptionDialog is rendered from MainScreen — it lives in
    // proprietaryMain and main code is not allowed to reference it directly.
    // onRequestTransfer above is a signal that "the user clicked to transfer
    // their subscription"; MainScreen will open the appropriate dialog.

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp)
    ) {
        if (showAccountCard) {
            Text(
                stringResource(R.string.settings_section_account),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 8.dp)
            )
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHighest
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        if (userEmail != null) stringResource(R.string.settings_account_logged_in)
                        else stringResource(R.string.settings_account_status),
                        style = MaterialTheme.typography.labelSmall
                    )
                    Text(
                        userEmail ?: stringResource(R.string.settings_account_unregistered),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
        if (showDevices) {
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_devices)) },
                leadingContent = { Icon(Icons.Default.Computer, null) },
                colors = transparentList,
                modifier = Modifier.clickable(onClick = onOpenDevices)
            )
        }
        if (showSubscription) {
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_subscription)) },
                leadingContent = { Icon(Icons.Default.ShoppingCart, null) },
                colors = transparentList,
                modifier = Modifier.clickable(onClick = onOpenSubscription)
            )
        }
        if (showTelegramLink) {
            ListItem(
                headlineContent = { Text(if (tgId == null) stringResource(R.string.settings_transfer_subscription) else stringResource(R.string.settings_telegram_linked)) },
                supportingContent = if (tgId != null) { { Text(stringResource(R.string.settings_telegram_id, tgId)) } } else null,
                leadingContent = { Icon(Icons.Default.Link, null) },
                colors = transparentList,
                modifier = Modifier.clickable {
                    if (tgId == null) onRequestTransfer() else onUnlinkTelegram()
                }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(
            stringResource(R.string.settings_section_settings),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(vertical = 8.dp)
        )

        AppDeps.launchers.ExtraSettingsItems(onAddConfig)

        ListItem(
            headlineContent = { Text(stringResource(R.string.settings_access_control)) },
            supportingContent = { Text(stringResource(R.string.settings_access_control_subtitle)) },
            leadingContent = { Icon(Icons.Default.Security, null) },
            colors = transparentList,
            modifier = Modifier.clickable(onClick = onOpenAccessControl)
        )
        ListItem(
            headlineContent = { Text(stringResource(R.string.settings_share_vpn)) },
            leadingContent = { Icon(Icons.Default.Share, null) },
            colors = transparentList,
            modifier = Modifier.clickable(onClick = onShareVpn)
        )
        ListItem(
            headlineContent = { Text(stringResource(R.string.settings_logs)) },
            leadingContent = { Icon(Icons.Default.List, null) },
            colors = transparentList,
            modifier = Modifier.clickable {
                context.startActivity(Intent(context, LogsActivity::class.java))
            }
        )
        ListItem(
            headlineContent = { Text(stringResource(R.string.settings_info)) },
            leadingContent = { Icon(Icons.Default.Info, null) },
            colors = transparentList,
            modifier = Modifier
                .testTag("settings_info")
                .clickable { showInfoDialog = true }
        )

        Spacer(modifier = Modifier.height(32.dp))

        val displayVersion = BuildConfig.VERSION_NAME.split('-').first()
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (UpdateManager.isEnabled) {
                val checkingUpdateText = stringResource(R.string.settings_checking_update)
                val checkUpdateText = stringResource(R.string.settings_check_update)
                val versionText = buildAnnotatedString {
                    append("v$displayVersion · ")
                    pushStringAnnotation(tag = "check", annotation = "check")
                    withStyle(
                        SpanStyle(
                            color = MaterialTheme.colorScheme.primary,
                            textDecoration = TextDecoration.Underline
                        )
                    ) {
                        append(if (isCheckingUpdate) checkingUpdateText else checkUpdateText)
                    }
                    pop()
                }
                ClickableText(
                    text = versionText,
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    ),
                    onClick = { offset ->
                        versionText.getStringAnnotations("check", offset, offset).firstOrNull()
                            ?.let { onCheckUpdate() }
                    }
                )
            } else {
                Text(
                    text = "v$displayVersion",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                )
            }

            if (showLogout) {
                Spacer(modifier = Modifier.height(8.dp))

                TextButton(onClick = onLogout) {
                    Text(
                        if (userEmail != null) stringResource(R.string.settings_logout)
                        else stringResource(R.string.settings_register_reset),
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}
