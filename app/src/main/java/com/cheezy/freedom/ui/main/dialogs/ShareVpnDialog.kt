package com.cheezy.freedom.ui.main.dialogs

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.cheezy.freedom.util.QrCodeUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareVpnDialog(
    tunAddress: String,
    localIp: String,
    subscriptionUrl: String,
    info: ShareVpnInfo,
    onToggleLocalProxy: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val qrBitmap = remember(subscriptionUrl) {
        if (subscriptionUrl.isNotBlank()) {
            QrCodeUtils.generateQrCode(subscriptionUrl, 512)
        } else null
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Scaffold(
                topBar = {
                    TopAppBar(
                        title = { Text("Share VPN") },
                        navigationIcon = {
                            IconButton(onClick = onDismiss) {
                                Icon(Icons.Default.Close, contentDescription = "Close")
                            }
                        }
                    )
                }
            ) { padding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState())
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "Use the QR code for quick subscription import or the local IP for proxy settings.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )

                    if (qrBitmap != null) {
                        Spacer(modifier = Modifier.height(24.dp))
                        Image(
                            bitmap = qrBitmap.asImageBitmap(),
                            contentDescription = "Subscription QR Code",
                            modifier = Modifier
                                .size(240.dp)
                                .aspectRatio(1f)
                        )
                        Text(
                            "Subscription QR Code",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Spacer(modifier = Modifier.height(32.dp))
                    HorizontalDivider()
                    Spacer(modifier = Modifier.height(24.dp))

                    Column(modifier = Modifier.fillMaxWidth()) {
                        InfoSection(
                            label = "TUN IP Address:",
                            value = tunAddress.ifBlank { "VPN not running" }
                        )

                        Spacer(modifier = Modifier.height(20.dp))

                        InfoSection(
                            label = "Local IP Address:",
                            value = localIp.ifBlank { "Unknown" }
                        )

                        Spacer(modifier = Modifier.height(24.dp))

                        LocalProxySection(
                            info = info,
                            onToggle = onToggleLocalProxy,
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        PortsSection(info = info)
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoSection(label: String, value: String) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

@Composable
private fun LocalProxySection(
    info: ShareVpnInfo,
    onToggle: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            "Enable Local Proxy",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
        )
        Switch(
            checked = info.localProxyEnabled || info.localProxyForcedByBase,
            onCheckedChange = onToggle,
            enabled = !info.localProxyForcedByBase,
        )
    }
    if (info.localProxyForcedByBase) {
        Text(
            "Local proxy parameters are managed by your provider.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun PortsSection(info: ShareVpnInfo) {
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    val style = MaterialTheme.typography.bodySmall
    when {
        info.mixedPort != null -> {
            Text("Port (HTTP/SOCKS): ${info.mixedPort}", style = style, color = color)
        }
        info.httpPort != null || info.socksPort != null -> {
            info.httpPort?.let { Text("HTTP: $it", style = style, color = color) }
            info.socksPort?.let { Text("SOCKS: $it", style = style, color = color) }
        }
    }
}
