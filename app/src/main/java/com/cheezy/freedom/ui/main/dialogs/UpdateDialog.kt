package com.cheezy.freedom.ui.main.dialogs

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.cheezy.freedom.UpdateManager

@Composable
fun UpdateDialog(info: UpdateManager.UpdateInfo?, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val update = info?.takeIf { it.isNewer } ?: return
    val status = UpdateManager.getDownloadStatus(context, update.version)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Доступно обновление") },
        text = {
            Text(when (status) {
                UpdateManager.DownloadStatus.DOWNLOADING -> "Новая версия ${update.version} уже загружается..."
                UpdateManager.DownloadStatus.DOWNLOADED -> "Новая версия ${update.version} скачана и готова к установке."
                else -> "Найдена новая версия: ${update.version}. Хотите обновить приложение?"
            })
        },
        confirmButton = {
            TextButton(onClick = {
                when (status) {
                    UpdateManager.DownloadStatus.DOWNLOADED -> UpdateManager.installApk(context)
                    UpdateManager.DownloadStatus.DOWNLOADING -> onDismiss()
                    else -> {
                        UpdateManager.downloadAndInstall(context, update)
                        onDismiss()
                    }
                }
            }) { Text(if (status == UpdateManager.DownloadStatus.DOWNLOADED) "Установить" else "Обновить") }
        },
        dismissButton = {
            if (status != UpdateManager.DownloadStatus.DOWNLOADING) {
                TextButton(onClick = onDismiss) { Text("Позже") }
            }
        }
    )
}
