package com.cheezy.freedom.ui.main.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.cheezy.freedom.R
import com.cheezy.freedom.PrivacyPolicyDialog
import com.cheezy.freedom.TermsOfServiceDialog
import com.github.kr328.clash.core.bridge.Bridge

@Composable
fun AppInfoDialog(onDismiss: () -> Unit) {
    var showPolicyDialog by remember { mutableStateOf(false) }
    var showTermsDialog by remember { mutableStateOf(false) }

    // The core version is read once when the dialog opens. This is a JNI call
    // to libclash that simply returns a constant compiled via -ldflags -X
    // in core/build.gradle.kts during the libclash.so build.
    //
    // IMPORTANT: libbridge.so is loaded only in the :vpn process (see CheezyApp),
    // so in the UI process we explicitly call ensureLoaded() before the JNI call.
    // Otherwise, ART throws UnsatisfiedLinkError / "No implementation found"
    // (the symbol exists in the .so, but the .so is not loaded in this process's
    // address space). nativeMihomoVersion returns a read-only constant and does
    // NOT require a preliminary coreInit, so just loading the library is enough.
    val mihomoVersion = remember {
        runCatching {
            Bridge.ensureLoaded()
            Bridge.nativeMihomoVersion()
        }.getOrDefault("unknown")
    }

    if (showPolicyDialog) PrivacyPolicyDialog { showPolicyDialog = false }
    if (showTermsDialog) TermsOfServiceDialog { showTermsDialog = false }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.info_title)) },
        text = {
            // ListItem defaults to an opaque `surface` container that reads as a
            // white block against the dialog's container colour — make them
            // transparent so the rows blend into the dialog.
            val transparentList = ListItemDefaults.colors(containerColor = Color.Transparent)
            Column {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.info_developer)) },
                    supportingContent = { Text("l0nelynx") },
                    colors = transparentList
                )
                ListItem(
                    headlineContent = { Text(stringResource(R.string.info_core_version)) },
                    supportingContent = { Text(stringResource(R.string.info_core_version_value, mihomoVersion)) },
                    colors = transparentList
                )
                ListItem(
                    headlineContent = { Text(stringResource(R.string.info_privacy_policy)) },
                    colors = transparentList,
                    modifier = Modifier.clickable { showPolicyDialog = true }
                )
                ListItem(
                    headlineContent = { Text(stringResource(R.string.info_terms)) },
                    colors = transparentList,
                    modifier = Modifier.clickable { showTermsDialog = true }
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.info_close)) } }
    )
}
