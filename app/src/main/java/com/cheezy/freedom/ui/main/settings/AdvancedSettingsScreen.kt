package com.cheezy.freedom.ui.main.settings

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.cheezy.freedom.R
import com.cheezy.freedom.clash.WapMode
import com.cheezy.freedom.clash.WapSettings
import com.cheezy.freedom.clash.XrayMuxSettings

// Zashboard talks to the local mihomo controller over HTTP. Using the HTTP page
// avoids a browser mixed-content block when it connects to 127.0.0.1:9090.
private const val ZASHBOARD_URL = "http://board.zash.run.place/"

@Composable
fun AdvancedSettingsScreen(
    wapSettings: WapSettings,
    xrayMuxSettings: XrayMuxSettings,
    onSaveWapSettings: (WapSettings) -> Unit,
    onSaveXrayMuxSettings: (XrayMuxSettings) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val transparentList = ListItemDefaults.colors(containerColor = Color.Transparent)
    var showWapDialog by remember { mutableStateOf(false) }
    var showXrayMuxDialog by remember { mutableStateOf(false) }

    if (showXrayMuxDialog) {
        XrayMuxSettingsDialog(
            initial = xrayMuxSettings,
            onDismiss = { showXrayMuxDialog = false },
            onSave = {
                onSaveXrayMuxSettings(it)
                showXrayMuxDialog = false
            },
        )
    }

    if (showWapDialog) {
        WapSettingsDialog(
            initial = wapSettings,
            onDismiss = { showWapDialog = false },
            onSave = {
                onSaveWapSettings(it)
                showWapDialog = false
            },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.settings_advanced_back),
                )
            }
            Text(
                text = stringResource(R.string.settings_advanced),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Spacer(Modifier.height(12.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
            ),
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(Icons.Default.WarningAmber, contentDescription = null)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        text = stringResource(R.string.settings_advanced_warning_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.settings_advanced_warning_body),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        Spacer(Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.settings_advanced_features),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
            ),
        ) {
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_xray_mux)) },
                supportingContent = {
                    Text(
                        if (!xrayMuxSettings.enabled) {
                            stringResource(R.string.settings_xray_mux_off)
                        } else {
                            val max = if (xrayMuxSettings.maxConnections == 0) {
                                stringResource(R.string.settings_xray_mux_unlimited)
                            } else {
                                xrayMuxSettings.maxConnections.toString()
                            }
                            stringResource(
                                R.string.settings_xray_mux_summary,
                                xrayMuxSettings.concurrency,
                                max,
                            )
                        },
                    )
                },
                leadingContent = { Icon(Icons.Default.Tune, contentDescription = null) },
                trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null) },
                colors = transparentList,
                modifier = Modifier.clickable { showXrayMuxDialog = true },
            )

            HorizontalDivider(
                modifier = Modifier.padding(start = 56.dp),
                color = MaterialTheme.colorScheme.outlineVariant,
            )

            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_wap)) },
                supportingContent = {
                    Text(
                        when (wapSettings.mode) {
                            WapMode.OFF -> stringResource(R.string.settings_wap_off)
                            WapMode.AUTO -> stringResource(R.string.settings_wap_auto_summary)
                            WapMode.MANUAL -> "${wapSettings.host}:${wapSettings.port}"
                        },
                    )
                },
                leadingContent = { Icon(Icons.Default.Cloud, contentDescription = null) },
                trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null) },
                colors = transparentList,
                modifier = Modifier.clickable { showWapDialog = true },
            )

            HorizontalDivider(
                modifier = Modifier.padding(start = 56.dp),
                color = MaterialTheme.colorScheme.outlineVariant,
            )

            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_zashboard)) },
                supportingContent = { Text(stringResource(R.string.settings_zashboard_summary)) },
                leadingContent = { Icon(Icons.Default.Language, contentDescription = null) },
                trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null) },
                colors = transparentList,
                modifier = Modifier.clickable {
                    CustomTabsIntent.Builder()
                        .setShowTitle(true)
                        .build()
                        .launchUrl(context, Uri.parse(ZASHBOARD_URL))
                },
            )
        }
    }
}

@Composable
private fun XrayMuxSettingsDialog(
    initial: XrayMuxSettings,
    onDismiss: () -> Unit,
    onSave: (XrayMuxSettings) -> Unit,
) {
    var enabled by remember(initial) { mutableStateOf(initial.enabled) }
    var concurrency by remember(initial) { mutableStateOf(initial.concurrency.toString()) }
    var maxConnections by remember(initial) { mutableStateOf(initial.maxConnections.toString()) }
    val parsedConcurrency = concurrency.toIntOrNull()
    val parsedMaxConnections = maxConnections.toIntOrNull()
    val valid = parsedConcurrency != null && parsedConcurrency >= 1 &&
        parsedMaxConnections != null && parsedMaxConnections >= 0

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_xray_mux)) },
        text = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.settings_xray_mux_enabled),
                        modifier = Modifier.weight(1f),
                    )
                    Switch(checked = enabled, onCheckedChange = { enabled = it })
                }
                OutlinedTextField(
                    value = concurrency,
                    onValueChange = { concurrency = it.filter(Char::isDigit) },
                    label = { Text(stringResource(R.string.settings_xray_mux_concurrency)) },
                    supportingText = { Text(stringResource(R.string.settings_xray_mux_concurrency_hint)) },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = maxConnections,
                    onValueChange = { maxConnections = it.filter(Char::isDigit) },
                    label = { Text(stringResource(R.string.settings_xray_mux_max_connections)) },
                    supportingText = { Text(stringResource(R.string.settings_xray_mux_max_connections_hint)) },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = {
                    onSave(
                        XrayMuxSettings(
                            enabled = enabled,
                            concurrency = parsedConcurrency ?: initial.concurrency,
                            maxConnections = parsedMaxConnections ?: initial.maxConnections,
                        ),
                    )
                },
            ) { Text(stringResource(android.R.string.ok)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(android.R.string.cancel)) }
        },
    )
}

@Composable
private fun WapSettingsDialog(
    initial: WapSettings,
    onDismiss: () -> Unit,
    onSave: (WapSettings) -> Unit,
) {
    var mode by remember(initial) { mutableStateOf(initial.mode) }
    var host by remember(initial) { mutableStateOf(initial.host) }
    var port by remember(initial) { mutableStateOf(initial.port.toString()) }
    var username by remember(initial) { mutableStateOf(initial.username) }
    var password by remember(initial) { mutableStateOf(initial.password) }
    val parsedPort = port.toIntOrNull()
    val valid = mode != WapMode.MANUAL || (host.isNotBlank() && parsedPort in 1..65535)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_wap)) },
        text = {
            Column {
                WapMode.entries.forEach { entry ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { mode = entry }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = mode == entry, onClick = { mode = entry })
                        Text(
                            when (entry) {
                                WapMode.OFF -> stringResource(R.string.settings_wap_mode_off)
                                WapMode.AUTO -> stringResource(R.string.settings_wap_mode_auto)
                                WapMode.MANUAL -> stringResource(R.string.settings_wap_mode_manual)
                            },
                        )
                    }
                }
                if (mode == WapMode.MANUAL) {
                    OutlinedTextField(
                        value = host,
                        onValueChange = { host = it },
                        label = { Text(stringResource(R.string.settings_wap_host)) },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = port,
                        onValueChange = { port = it.filter(Char::isDigit) },
                        label = { Text(stringResource(R.string.settings_wap_port)) },
                        singleLine = true,
                    )
                }
                if (mode != WapMode.OFF) {
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text(stringResource(R.string.settings_wap_username)) },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text(stringResource(R.string.settings_wap_password)) },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = {
                    onSave(
                        initial.copy(
                            mode = mode,
                            host = host.trim(),
                            port = parsedPort ?: initial.port,
                            username = username,
                            password = password,
                        ),
                    )
                },
            ) { Text(stringResource(android.R.string.ok)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(android.R.string.cancel)) }
        },
    )
}
