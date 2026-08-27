package com.cheezy.freedom.ui.main.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.platform.app.InstrumentationRegistry
import com.cheezy.freedom.BuildConfig
import com.cheezy.freedom.R
import com.cheezy.freedom.clash.WapSettings
import com.cheezy.freedom.clash.XrayMuxSettings
import com.cheezy.freedom.ui.theme.CheezyVPNTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class CrashReportingSettingsTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun settingsOnlyExposeDescriptionAndSwitchInsideDialog() {
        val summary = InstrumentationRegistry.getInstrumentation().targetContext
            .getString(R.string.crash_reporting_summary)
        compose.setContent {
            var enabled by remember { mutableStateOf(true) }
            CheezyVPNTheme {
                SettingsTab(
                    crashReportingEnabled = enabled,
                    onCrashReportingChanged = { enabled = it },
                    userEmail = null,
                    tgId = null,
                    isCheckingUpdate = false,
                    wapSettings = WapSettings(),
                    xrayMuxSettings = XrayMuxSettings(),
                    showAccountCard = false,
                    showDevices = false,
                    showSubscription = false,
                    showTelegramLink = false,
                    showLogout = false,
                    onAddConfig = {},
                    onCheckUpdate = {},
                    onLogout = {},
                    onOpenSubscription = {},
                    onOpenDevices = {},
                    onShareVpn = {},
                    onUnlinkTelegram = {},
                    onRequestTransfer = {},
                    onOpenAccessControl = {},
                    onSaveWapSettings = {},
                    onSaveXrayMuxSettings = {},
                )
            }
        }

        compose.onNodeWithText(summary).assertDoesNotExist()
        compose.onNodeWithTag("crash_reporting_switch").assertDoesNotExist()
        val entry = compose.onNodeWithTag("settings_crash_reporting")
        if (!BuildConfig.FIREBASE_ENABLED) {
            entry.assertDoesNotExist()
            return
        }

        entry.performScrollTo().assertIsDisplayed()
        val aboutBounds = compose.onNodeWithTag("settings_info").fetchSemanticsNode().boundsInRoot
        assertTrue(entry.fetchSemanticsNode().boundsInRoot.top >= aboutBounds.bottom)
        entry.performClick()
        compose.onNodeWithTag("crash_reporting_dialog").assertIsDisplayed()
        compose.onNodeWithText(summary).assertExists()
        compose.onNodeWithTag("crash_reporting_switch").assertIsOn().performClick().assertIsOff()
        compose.onNodeWithTag("crash_reporting_close").performClick()

        compose.onNodeWithText(summary).assertDoesNotExist()
        compose.onNodeWithTag("crash_reporting_switch").assertDoesNotExist()
        entry.performClick()
        compose.onNodeWithTag("crash_reporting_switch").assertIsOff()
    }

    @Test
    fun dialogUsesExternalStateAndDoesNotToggleOnDismiss() {
        val changes = mutableListOf<Boolean>()
        var dismissed = false
        compose.setContent {
            CheezyVPNTheme {
                CrashReportingDialog(
                    enabled = false,
                    onEnabledChange = { changes += it },
                    onDismiss = { dismissed = true },
                )
            }
        }

        compose.onNodeWithTag("crash_reporting_switch").assertIsOff().performClick().assertIsOff()
        compose.onNodeWithTag("crash_reporting_close").performClick()
        compose.runOnIdle {
            assertEquals(listOf(true), changes)
            assertTrue(dismissed)
        }
    }
}
