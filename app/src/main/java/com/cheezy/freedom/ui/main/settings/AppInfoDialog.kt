package com.cheezy.freedom.ui.main.settings

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.cheezy.freedom.PrivacyPolicyDialog
import com.cheezy.freedom.TermsOfServiceDialog
import com.github.kr328.clash.core.bridge.Bridge

// Zashboard connects to 127.0.0.1:9090 (mihomo external-controller) from the browser.
// We open it via HTTP to avoid mixed-content issues (HTTPS→HTTP API). GH Pages
// serves both versions without redirect for this domain, verified.
private const val ZASHBOARD_URL = "http://board.zash.run.place/"

@Composable
fun AppInfoDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
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
        title = { Text("О приложении") },
        text = {
            Column {
                ListItem(
                    headlineContent = { Text("Разработчик") },
                    supportingContent = { Text("CheezyVPN Team") }
                )
                ListItem(
                    headlineContent = { Text("Версия ядра (Mihomo)") },
                    supportingContent = { Text("$mihomoVersion · открыть Dashboard") },
                    modifier = Modifier.clickable {
                        CustomTabsIntent.Builder()
                            .setShowTitle(true)
                            .build()
                            .launchUrl(context, Uri.parse(ZASHBOARD_URL))
                    }
                )
                ListItem(
                    headlineContent = { Text("Политика конфиденциальности") },
                    modifier = Modifier.clickable { showPolicyDialog = true }
                )
                ListItem(
                    headlineContent = { Text("Пользовательское соглашение") },
                    modifier = Modifier.clickable { showTermsDialog = true }
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Закрыть") } }
    )
}
