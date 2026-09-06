package com.cheezy.freedom.ui.main.dialogs

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import com.cheezy.freedom.R

@Composable
fun UrlDialog(initial: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit,
              onValueChange: (String) -> Unit, busy: Boolean = false, error: String? = null) {
    AlertDialog(
        // Dialog is a separate window — expose testTags for UiAutomator (baseline profile).
        modifier = Modifier
            .semantics { testTagsAsResourceId = true }
            .testTag("url_dialog"),
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.url_title)) },
        text = {
            OutlinedTextField(
                value = initial,
                onValueChange = onValueChange,
                enabled = !busy,
                isError = error != null,
                supportingText = { if (error != null) Text(error) },
                singleLine = true,
                label = { Text(stringResource(R.string.url_hint)) },
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(initial.trim()) }, enabled = initial.isNotBlank() && !busy) {
                if (busy) androidx.compose.material3.CircularProgressIndicator() else Text(stringResource(R.string.url_load))
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("url_dialog_cancel"),
            ) {
                Text(stringResource(R.string.url_cancel))
            }
        }
    )
}
