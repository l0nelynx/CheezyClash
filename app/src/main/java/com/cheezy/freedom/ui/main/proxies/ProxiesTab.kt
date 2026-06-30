package com.cheezy.freedom.ui.main.proxies

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.RoundedPolygon
import androidx.graphics.shapes.circle
import androidx.graphics.shapes.star
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ConfigManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

private const val PING_TIMEOUT_VALUE = 65535
private const val HEALTH_CHECK_TIMEOUT_MS = 5_000L

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ProxiesTab(
    vpnRunning: Boolean,
    viewModel: com.cheezy.freedom.ui.main.MainViewModel = androidx.lifecycle.viewmodel.compose.viewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val rawGroups by viewModel.proxyGroups.collectAsState()
    val groupIcons by viewModel.groupIcons.collectAsState()
    // SnapshotStateMap instead of Set<String>: tapping a header mutates a single cell,
    // recompose affects only that header and its child rows —
    // instead of recreating the entire collection (as `expandedGroups +/- groupName` did).
    val expandedGroups = remember { mutableStateMapOf<String, Boolean>() }
    val pingingGroups = remember { mutableStateMapOf<String, Boolean>() }
    val pingingProxies = remember { mutableStateMapOf<String, Boolean>() }
    val pings by ClashState.pings.collectAsState()
    val loading by viewModel.isPinging.collectAsState()
    var error by remember { mutableStateOf<String?>(null) }

    // Don't trigger reloadProxyGroups every time the tab is opened: data comes
    // from the cache (ConfigManager.loadProxyGroupsCache in MainViewModel init) and
    // is updated by explicit triggers — ping, proxy selection (patchSelector),
    // subscription update, or ClashState.lastUpdateTime tick.

    Column(Modifier.fillMaxSize()) {
        when {
            rawGroups == null && error == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularWavyProgressIndicator()
            }
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error!!)
            }
            else -> {
                val groups = rawGroups ?: emptyList()
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp)
                ) {
                    groups.forEach { (groupName, proxies) ->
                        val isExpanded = expandedGroups[groupName] == true
                        val currentProxy = proxies.firstOrNull()?.groupNow ?: ""

                        // Wrap Header in remember so the data class isn't created
                        // on every recompose of the parent lambda — this is important
                        // for GroupHeader's skippability.
                        stickyHeader(key = "h_$groupName") {
                            val headerItem = remember(groupName, proxies.size, currentProxy, isExpanded, groupIcons) {
                                ProxyListItem.Header(
                                    name = groupName,
                                    type = "Selector",
                                    proxiesCount = proxies.size,
                                    currentProxy = currentProxy,
                                    isExpanded = isExpanded,
                                    iconResId = groupIcons[groupName] ?: 0
                                )
                            }
                            GroupHeader(
                                item = headerItem,
                                onToggle = {
                                    expandedGroups[groupName] = !isExpanded
                                },
                                isPinging = pingingGroups[groupName] == true,
                                onPing = if (vpnRunning) {
                                    {
                                        scope.launch {
                                            pingingGroups[groupName] = true
                                            try {
                                                withContext(Dispatchers.IO) {
                                                    withTimeoutOrNull(HEALTH_CHECK_TIMEOUT_MS) {
                                                        runCatching { ClashRemoteManager.healthCheck(groupName) }
                                                    }
                                                    kotlinx.coroutines.delay(2000)
                                                    val existing = HashMap(ClashState.pings.value)
                                                    ClashRemoteManager.queryGroup(groupName)?.let { group ->
                                                        group.proxies.forEach { p ->
                                                            existing[p.name] = if (p.delay in 1 until PING_TIMEOUT_VALUE) p.delay else -1
                                                        }
                                                    }
                                                    ClashState.setPings(existing)
                                                }
                                            } finally {
                                                pingingGroups[groupName] = false
                                            }
                                        }
                                    }
                                } else null
                            )
                        }

                        if (isExpanded) {
                            items(
                                items = proxies,
                                key = { "p_${groupName}_${it.name}" }
                            ) { proxy ->
                                val displaySubtitle = proxy.activeChild ?: proxy.subtitle
                                val pingKey = proxy.activeChild ?: proxy.name
                                val pingMs = pings[pingKey]
                                val isSelected = proxy.name == currentProxy
                                val rowItem = remember(groupName, proxy, displaySubtitle, pingMs, isSelected) {
                                    ProxyListItem.ProxyItem(
                                        groupName, proxy.name, proxy.type, displaySubtitle,
                                        pingMs, isSelected
                                    )
                                }
                                ProxyRow(
                                    item = rowItem,
                                    onClick = {
                                        scope.launch {
                                            val ok = withContext(Dispatchers.IO) {
                                                ClashRemoteManager.patchSelector(groupName, proxy.name)
                                            }
                                            if (ok) viewModel.reloadProxyGroups()
                                        }
                                    },
                                    isPinging = pingingProxies[proxy.name] == true,
                                    onPing = if (vpnRunning) {
                                        {
                                            scope.launch {
                                                pingingProxies[proxy.name] = true
                                                try {
                                                    withContext(Dispatchers.IO) {
                                                        withTimeoutOrNull(HEALTH_CHECK_TIMEOUT_MS) {
                                                            runCatching { ClashRemoteManager.healthCheck(proxy.name) }
                                                        }
                                                        kotlinx.coroutines.delay(2000)
                                                        ClashRemoteManager.queryGroup(groupName)?.let { group ->
                                                            val found = group.proxies.firstOrNull { it.name == proxy.name }
                                                            if (found != null) {
                                                                val existing = HashMap(ClashState.pings.value)
                                                                existing[found.name] = if (found.delay in 1 until PING_TIMEOUT_VALUE) found.delay else -1
                                                                ClashState.setPings(existing)
                                                            }
                                                        }
                                                    }
                                                } finally {
                                                    pingingProxies[proxy.name] = false
                                                }
                                            }
                                        }
                                    } else null,
                                    modifier = Modifier.animateItem()
                                )
                            }
                        }

                        item(key = "d_$groupName") {
                            HorizontalDivider(
                                modifier = Modifier
                                    .padding(horizontal = 16.dp)
                                    .animateItem()
                            )
                        }
                    }
                }
            }
        }
    }
}
