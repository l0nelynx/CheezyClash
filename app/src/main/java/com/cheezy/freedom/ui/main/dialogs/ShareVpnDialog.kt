package com.cheezy.freedom.ui.main.dialogs

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.cheezy.freedom.util.QrCodeUtils

@Composable
fun ShareVpnDialog(
    tunAddress: String,
    localIp: String,
    subscriptionUrl: String,
    onDismiss: () -> Unit
) {
    val qrBitmap = remember(subscriptionUrl) {
        if (subscriptionUrl.isNotBlank()) {
            QrCodeUtils.generateQrCode(subscriptionUrl, 512)
        } else null
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Раздать VPN") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "Используйте QR-код для быстрого импорта подписки или локальный IP для настройки прокси.",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )
                
                if (qrBitmap != null) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = "Subscription QR Code",
                        modifier = Modifier
                            .size(200.dp)
                            .aspectRatio(1f)
                    )
                    Text(
                        "QR-код подписки",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
                
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text("IP-адрес TUN:", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    Text(
                        if (tunAddress.isNotBlank()) tunAddress else "VPN не запущен",
                        style = MaterialTheme.typography.bodyLarge
                    )
                    
                    Spacer(modifier = Modifier.height(12.dp))
                    
                    Text("Локальный IP:", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    Text(
                        localIp.ifBlank { "Неизвестно" },
                        style = MaterialTheme.typography.bodyLarge
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Порт: 2080 (HTTP/SOCKS)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Закрыть")
            }
        }
    )
}
