package com.cheezy.freedom.ui.main.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.cheezy.freedom.clash.ConnectionPhase
import com.cheezy.freedom.ui.main.proxies.PrimaryProxyGroupUiData
import com.cheezy.freedom.ui.main.proxies.ProxyUiData
import com.cheezy.freedom.ui.theme.CheezyVPNTheme
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class HomeServerPickerTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun countryFlagReplacesGlobeAndIsRemovedFromHomeName() {
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "🇩🇪 Germany 01",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(listOf("🇩🇪 Germany 01")),
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_server_flag").assertTextEquals("🇩🇪")
        compose.onNodeWithTag("home_server_globe").assertDoesNotExist()
        compose.onNodeWithText("Germany 01").assertIsDisplayed()
        compose.onNodeWithText("🇩🇪 Germany 01").assertDoesNotExist()
    }

    @Test
    fun nameWithoutCountryFlagKeepsGlobe() {
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "Amsterdam",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(listOf("Amsterdam")),
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_server_globe").assertIsDisplayed()
        compose.onNodeWithTag("home_server_flag").assertDoesNotExist()
        compose.onNodeWithText("Amsterdam").assertIsDisplayed()
    }

    @Test
    fun activeChildCountryFlagHasPriority() {
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "🇺🇸 AUTO",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = PrimaryProxyGroupUiData(
                        name = "PROXY",
                        now = "🇺🇸 AUTO",
                        proxies = listOf(
                            ProxyUiData(
                                name = "🇺🇸 AUTO",
                                type = "URLTest",
                                subtitle = "Automatic",
                                groupNow = "🇺🇸 AUTO",
                                activeChild = "🇯🇵 Tokyo 01",
                            ),
                        ),
                    ),
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_server_flag").assertTextEquals("🇯🇵")
        compose.onNodeWithText("AUTO").assertIsDisplayed()
        compose.onNodeWithText("Tokyo 01").assertIsDisplayed()
        compose.onNodeWithText("🇯🇵 Tokyo 01").assertDoesNotExist()
    }

    @Test
    fun bottomSheetAndSelectionKeepRawProxyName() {
        var selection: Pair<String, String>? = null
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "🇩🇪 Germany",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(listOf("🇩🇪 Germany", "🇵🇱 Warsaw")),
                    onSelectProxy = { group, proxy -> selection = group to proxy },
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_active_server").performClick()
        compose.onNodeWithText("🇵🇱 Warsaw").assertIsDisplayed().performClick()

        assertEquals("PROXY" to "🇵🇱 Warsaw", selection)
    }

    @Test
    fun opensPickerAndSelectsServer() {
        var selection: Pair<String, String>? = null
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "Amsterdam",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(listOf("Amsterdam", "Warsaw")),
                    proxyDelays = mapOf("PROXY" to mapOf("Amsterdam" to 80, "Warsaw" to 120)),
                    onSelectProxy = { group, proxy -> selection = group to proxy },
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_active_server").performClick()
        compose.onNodeWithTag("home_server_picker").assertIsDisplayed()
        compose.onNodeWithText("Warsaw").performClick()

        assertEquals("PROXY" to "Warsaw", selection)
    }

    @Test
    fun selectedRowIsMarkedAndSuccessfulSelectionClosesPicker() {
        compose.setContent {
            var current by remember { mutableStateOf("Amsterdam") }
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = current,
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(listOf("Amsterdam", "Warsaw"), current),
                    onSelectProxy = { _, proxy -> current = proxy },
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_active_server").performClick()
        compose.onNode(androidx.compose.ui.test.isSelected()).assertIsSelected()
        compose.onNodeWithText("Warsaw").performClick()

        compose.onNodeWithTag("home_server_picker").assertDoesNotExist()
    }

    @Test
    fun failedSelectionKeepsPickerOpen() {
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "Amsterdam",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(listOf("Amsterdam", "Warsaw")),
                    onSelectProxy = { _, _ -> },
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_active_server").performClick()
        compose.onNodeWithText("Warsaw").performClick()

        compose.onNodeWithTag("home_server_picker").assertIsDisplayed()
    }

    @Test
    fun busySelectionDisablesOtherRows() {
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "Amsterdam",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(listOf("Amsterdam", "Warsaw")),
                    selectingProxy = "Warsaw",
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_active_server").performClick()

        compose.onNodeWithText("Amsterdam").assertHasNoClickAction()
    }

    @Test
    fun cardWithoutSelectorIsReadOnly() {
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = "Amsterdam",
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = null,
                    onRefresh = {},
                    onVpnToggle = {},
                    phase = ConnectionPhase.CONNECTED,
                )
            }
        }

        compose.onNodeWithTag("home_active_server").assertHasNoClickAction()
        compose.onNodeWithTag("home_server_picker").assertDoesNotExist()
    }

    @Test
    fun largeGroupCanBeFiltered() {
        val names = (1..13).map { "Server $it" }
        compose.setContent {
            CheezyVPNTheme {
                HomeTab(
                    running = true,
                    proxyname = names.first(),
                    trafficNowFlow = MutableStateFlow(0L),
                    subscription = null,
                    lastUpdateTime = 0L,
                    lastError = null,
                    configName = "config.yaml",
                    loading = false,
                    primaryProxyGroup = group(names),
                    onRefresh = {},
                    onVpnToggle = {},
                )
            }
        }

        compose.onNodeWithTag("home_active_server").performClick()
        compose.onNodeWithTag("home_server_search").performTextInput("Server 13")

        compose.onNodeWithText("Server 13").assertIsDisplayed()
    }

    private fun group(
        names: List<String>,
        current: String = names.first(),
    ) = PrimaryProxyGroupUiData(
        name = "PROXY",
        now = current,
        proxies = names.map { name ->
            ProxyUiData(
                name = name,
                type = "Vless",
                subtitle = "Test node",
                groupNow = current,
            )
        },
    )
}
