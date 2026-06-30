package com.cheezy.freedom.ui.main.dialogs

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.cheezy.freedom.R
import com.cheezy.freedom.UpdateManager

@Composable
fun UpdateDialog(info: UpdateManager.UpdateInfo?, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val update = info?.takeIf { it.isNewer } ?: return
    val status = UpdateManager.getDownloadStatus(context, update.version)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.update_title)) },
        text = {
            Text(when (status) {
                UpdateManager.DownloadStatus.DOWNLOADING -> stringResource(R.string.update_downloading, update.version)
                UpdateManager.DownloadStatus.DOWNLOADED -> stringResource(R.string.update_downloaded, update.version)
                else -> stringResource(R.string.update_available, update.version)
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
            }) { Text(if (status == UpdateManager.DownloadStatus.DOWNLOADED) stringResource(R.string.update_install) else stringResource(R.string.update_update)) }
        },
        dismissButton = {
            if (status != UpdateManager.DownloadStatus.DOWNLOADING) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.update_later)) }
            }
        }
    )
}
