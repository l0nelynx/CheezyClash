package com.cheezy.freedom.ui.main.proxies

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.RoundedPolygon
import androidx.graphics.shapes.circle
import androidx.graphics.shapes.star
import com.cheezy.freedom.clash.ClashState
import kotlinx.coroutines.launch

private const val PING_TIMEOUT_VALUE = 65535

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ProxiesTab(
    vpnRunning: Boolean,
    viewModel: com.cheezy.freedom.ui.main.MainViewModel = androidx.lifecycle.viewmodel.compose.viewModel()
) {
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
                val listState = rememberLazyListState()
                val cardColor = MaterialTheme.colorScheme.surfaceContainerLow
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalFadingEdges(listState),
                    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 16.dp)
                ) {
                    groups.forEach { (groupName, proxies) ->
                        val isExpanded = expandedGroups[groupName] == true
                        val currentProxy = proxies.firstOrNull()?.groupNow ?: ""

                        // Sticky group header: stays pinned to the top while its
                        // proxies scroll under it, so the group can be collapsed at
                        // any scroll position. It's opaque (cardColor) so the rows
                        // pass cleanly behind it. Rounded fully when collapsed, only
                        // on top when expanded so it joins the rows into one card.
                        stickyHeader(key = "h_$groupName") {
                            val headerShape = if (isExpanded) {
                                RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
                            } else {
                                RoundedCornerShape(24.dp)
                            }
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
                            Surface(color = cardColor, shape = headerShape) {
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
                                                    viewModel.pingGroup(groupName)
                                                } finally {
                                                    pingingGroups[groupName] = false
                                                }
                                            }
                                        }
                                    } else null
                                )
                            }
                        }

                        if (isExpanded) {
                            itemsIndexed(
                                items = proxies,
                                key = { _, proxy -> "p_${groupName}_${proxy.name}" }
                            ) { index, proxy ->
                                val isLast = index == proxies.lastIndex
                                val rowShape = if (isLast) {
                                    RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp)
                                } else {
                                    RectangleShape
                                }
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
                                Surface(
                                    color = cardColor,
                                    shape = rowShape,
                                    modifier = Modifier.animateItem()
                                ) {
                                    Column {
                                        HorizontalDivider(
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
                                        )
                                        ProxyRow(
                                            item = rowItem,
                                            onClick = {
                                                viewModel.selectProxy(groupName, proxy.name)
                                            },
                                            isPinging = pingingProxies[proxy.name] == true,
                                            onPing = if (vpnRunning) {
                                                {
                                                    scope.launch {
                                                        pingingProxies[proxy.name] = true
                                                        try {
                                                            viewModel.pingProxy(groupName, proxy.name)
                                                        } finally {
                                                            pingingProxies[proxy.name] = false
                                                        }
                                                    }
                                                }
                                            } else null
                                        )
                                    }
                                }
                            }
                        }

                        item(key = "sp_$groupName") {
                            Spacer(Modifier.height(10.dp))
                        }
                    }
                }
            }
        }
    }
}

/**
 * Softly fades the list content into transparency near the top and bottom
 * edges instead of cutting rows off with a hard line. Each edge fade only
 * appears when there's actually content to scroll past it, so the first and
 * last items aren't dimmed at rest. Uses an off-screen layer + DstIn so the
 * fade reveals whatever surface sits behind the list.
 */
private fun Modifier.verticalFadingEdges(
    state: LazyListState,
    edge: Dp = 16.dp,
): Modifier = this
    .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
    .drawWithContent {
        drawContent()
        val edgePx = edge.toPx()
        if (state.canScrollBackward) {
            drawRect(
                brush = Brush.verticalGradient(
                    colors = listOf(Color.Transparent, Color.Black),
                    startY = 0f,
                    endY = edgePx
                ),
                blendMode = BlendMode.DstIn
            )
        }
        if (state.canScrollForward) {
            drawRect(
                brush = Brush.verticalGradient(
                    colors = listOf(Color.Black, Color.Transparent),
                    startY = size.height - edgePx,
                    endY = size.height
                ),
                blendMode = BlendMode.DstIn
            )
        }
    }
