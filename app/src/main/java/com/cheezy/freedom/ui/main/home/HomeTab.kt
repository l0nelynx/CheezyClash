@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package com.cheezy.freedom.ui.main.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.Morph
import com.cheezy.freedom.clash.SubscriptionInfo
import com.cheezy.freedom.ui.library.MorphPolygonShape
import com.cheezy.freedom.ui.theme.CheezyVPNTheme
import com.cheezy.freedom.util.formatBytes
import com.cheezy.freedom.util.formatExpire
import com.cheezy.freedom.util.formatKbps
import com.cheezy.freedom.util.formatLastUpdate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.time.Instant

private val ConnectButtonSize = 256.dp
private val ProgressRingStroke = 8.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeTab(
    running: Boolean,
    proxyname: String,
    trafficNowFlow: StateFlow<Long>,
    subscription: SubscriptionInfo?,
    lastUpdateTime: Long,
    lastError: String?,
    configName: String?,
    loading: Boolean,
    onRefresh: () -> Unit,
    onVpnToggle: () -> Unit
) {
    // Preserve last known proxy name so it's visible during exit animation
    var lastKnownProxy by remember { mutableStateOf(proxyname) }
    LaunchedEffect(proxyname) {
        if (proxyname.isNotBlank()) lastKnownProxy = proxyname
    }

    val pullState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = loading,
        onRefresh = onRefresh,
        state = pullState,
        modifier = Modifier.fillMaxSize()
    ) {
        // Content is laid out to fill the card exactly (top / centre / bottom blocks
        // spread via SpaceBetween) so nothing scrolls on a normal screen. The
        // verticalScroll + heightIn(min) only engages as a safety net on very short
        // screens, and is also what lets the pull-to-refresh gesture work.
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val minContentHeight = maxHeight
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .heightIn(min = minContentHeight)
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Top block — announcement (or nothing).
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    subscription?.announce?.takeIf { it.isNotBlank() }?.let { announce ->
                        AnnounceCard(text = announce)
                    }
                }

                // Centre block — the connect button and active-proxy badge.
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    ConnectButton(
                        running = running,
                        trafficNowFlow = trafficNowFlow,
                        subscription = subscription,
                        enabled = configName != null,
                        lastError = lastError,
                        onClick = onVpnToggle
                    )

                    AnimatedVisibility(
                        visible = running && proxyname.isNotBlank(),
                        enter = fadeIn() + expandVertically(expandFrom = Alignment.Top),
                        exit = fadeOut() + shrinkVertically(shrinkTowards = Alignment.Top)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Spacer(Modifier.height(14.dp))
                            ProxyBadge(proxyname = lastKnownProxy)
                        }
                    }
                }

                // Bottom block — error and subscription stats.
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    if (lastError != null) {
                        ErrorCard(message = lastError)
                        Spacer(Modifier.height(8.dp))
                    }

                    subscription?.let {
                        SubscriptionCard(info = it, lastUpdateTime = lastUpdateTime)
                    }
                }
            }
        }
    }
}

@Composable
private fun AnnounceCard(text: String) {
    var expanded by remember { mutableStateOf(false) }
    var hasOverflow by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(
                spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMediumLow
                )
            ),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
        ),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = if (expanded) Int.MAX_VALUE else 3,
                overflow = TextOverflow.Ellipsis,
                onTextLayout = { result ->
                    if (result.hasVisualOverflow && !hasOverflow) hasOverflow = true
                }
            )
            if (hasOverflow || expanded) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { expanded = !expanded }
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (expanded) "Свернуть" else "Читать далее",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(Modifier.width(4.dp))
                    Icon(
                        imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Composable
private fun ProxyBadge(proxyname: String) {
    Surface(
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.secondaryContainer
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Language,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSecondaryContainer
            )
            Text(
                text = proxyname,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 220.dp)
            )
        }
    }
}

@Composable
private fun SubscriptionCard(info: SubscriptionInfo, lastUpdateTime: Long) {
    val used = info.upload + info.download
    val isUnlimited = info.total <= 0L
    val remaining = if (isUnlimited) 0L else (info.total - used).coerceAtLeast(0L)
    val progress = if (isUnlimited) 0f
    else (used.toFloat() / info.total.toFloat()).coerceIn(0f, 1f)
    val animatedProgress by animateFloatAsState(targetValue = progress, label = "trafficProgress")

    val now = Instant.now().epochSecond
    val daysLeft = if (info.expire > 0) ((info.expire - now) / 86400L).toInt() else -1

    val progressColor = when {
        isUnlimited -> MaterialTheme.colorScheme.primary
        progress > 0.9f -> MaterialTheme.colorScheme.error
        progress > 0.75f -> Color(0xFFFFA000)
        else -> MaterialTheme.colorScheme.primary
    }
    val expireColor = when {
        daysLeft < 0 -> MaterialTheme.colorScheme.onSurfaceVariant
        daysLeft < 3 -> MaterialTheme.colorScheme.error
        daysLeft < 7 -> Color(0xFFFFA000)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.extraLarge,
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (!isUnlimited) {
                LinearWavyProgressIndicator(
                    progress = { animatedProgress },
                    modifier = Modifier.fillMaxWidth(),
                    color = progressColor,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                StatColumn(
                    label = "Использовано",
                    value = formatBytes(used),
                    valueColor = progressColor
                )
                StatColumn(
                    label = if (isUnlimited) "Лимит" else "Остаток",
                    value = if (isUnlimited) "∞" else formatBytes(remaining),
                    alignment = Alignment.End
                )
            }

            if (info.expire > 0 || lastUpdateTime > 0) {
                HorizontalDivider(
                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (info.expire > 0) {
                        Text(
                            text = "Истекает: ${formatExpire(info.expire)}",
                            style = MaterialTheme.typography.labelMedium,
                            color = expireColor,
                            fontWeight = if (daysLeft in 0..6) FontWeight.SemiBold else FontWeight.Normal
                        )
                    }
                    if (lastUpdateTime > 0) {
                        Text(
                            text = formatLastUpdate(lastUpdateTime),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                            textAlign = TextAlign.End
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatColumn(
    label: String,
    value: String,
    alignment: Alignment.Horizontal = Alignment.Start,
    valueColor: Color = Color.Unspecified,
) {
    Column(horizontalAlignment = alignment) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = valueColor
        )
    }
}

@Composable
private fun ErrorCard(message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun ConnectButton(
    running: Boolean,
    trafficNowFlow: StateFlow<Long>,
    subscription: SubscriptionInfo?,
    enabled: Boolean,
    onClick: () -> Unit,
    lastError: String? = null
) {
    val used = subscription?.let { it.upload + it.download } ?: 0L
    val total = subscription?.total ?: 0L
    val rawProgress = when {
        total <= 0L -> 0.999f
        total >= 1000L * 1024 * 1024 * 1024 -> 0.99f
        else -> (used.toFloat() / total.toFloat()).coerceIn(0f, 1f)
    }
    val animatedProgress by animateFloatAsState(targetValue = rawProgress, label = "trafficRing")

    val contentColor by animateColorAsState(
        targetValue = if (running) MaterialTheme.colorScheme.inverseSurface
        else MaterialTheme.colorScheme.onSurfaceVariant,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "contentColor"
    )
    val contentColorinverse by animateColorAsState(
        targetValue = if (running) MaterialTheme.colorScheme.inversePrimary
        else MaterialTheme.colorScheme.surfaceVariant,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "contentColorinverse"
    )
    val scale by animateFloatAsState(
        targetValue = if (running) 1.05f else 0.75f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessVeryLow),
        label = "buttonScale"
    )
    var isConnecting by remember { mutableStateOf(false) }
    LaunchedEffect(running, lastError) {
        if (running || lastError != null) isConnecting = false
    }
    val isRotating = running || isConnecting
    val angle = rotationAngle(isRotating)
    val morph = remember { Morph(MaterialShapes.Cookie4Sided, MaterialShapes.Cookie7Sided) }
    val morphProgress by animateFloatAsState(
        targetValue = if (running) 1f else 0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessVeryLow
        ),
        label = "morphProgress"
    )
    val morphShape = remember(morphProgress) { MorphPolygonShape(morph, morphProgress) }
    val density = LocalDensity.current
    val strokeWidthPx = remember(density) { with(density) { ProgressRingStroke.toPx() } }

    Box(
        modifier = Modifier.size(ConnectButtonSize),
        contentAlignment = Alignment.Center
    ) {
        CircularWavyProgressIndicator(
            progress = { if (running) animatedProgress else 1.0f },
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { scaleX = scale; scaleY = scale },
            wavelength = 64.dp,
            gapSize = 8.dp,
            stroke = Stroke(width = strokeWidthPx, cap = StrokeCap.Round, join = StrokeJoin.Round),
            trackColor = MaterialTheme.colorScheme.inversePrimary,
            waveSpeed = (96 / (animatedProgress + 1)).dp,
            amplitude = { if (running) 4.0f else 0f },
            color = if (running) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.tertiary
        )
        Surface(
            onClick = {
                if (!running) isConnecting = true
                onClick()
            },
            enabled = enabled,
            shape = morphShape,
            color = contentColorinverse,
            modifier = Modifier
                .size(192.dp)
                .graphicsLayer {
                    scaleX = scale; scaleY = scale
                    rotationZ = if (isRotating) angle else 0f
                }
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { rotationZ = if (isRotating) -angle else 0f }
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    Icons.Default.PowerSettingsNew,
                    contentDescription = if (running) "Отключить" else "Подключить",
                    modifier = Modifier.size(56.dp),
                    tint = contentColor
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    if (running) "Подключено" else "Отключено",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = contentColor
                )
                if (running) {
                    TrafficText(trafficNowFlow = trafficNowFlow, color = contentColor.copy(alpha = 0.8f))
                }
            }
        }
    }
}

@Composable
private fun rotationAngle(active: Boolean): Float {
    if (!active) return 0f
    val transition = rememberInfiniteTransition(label = "spin")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(20000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "angle"
    )
    return angle
}

@Composable
private fun TrafficText(trafficNowFlow: StateFlow<Long>, color: Color) {
    val trafficNow by trafficNowFlow.collectAsState()
    Text(
        formatKbps(trafficNow),
        style = MaterialTheme.typography.labelSmall,
        color = color
    )
}

@Preview(showBackground = true, name = "Home Tab - Connected")
@Composable
fun HomeTabConnectedPreview() {
    CheezyVPNTheme {
        HomeTab(
            running = true,
            proxyname = "Netherlands-Premium",
            trafficNowFlow = MutableStateFlow(125000L),
            subscription = SubscriptionInfo(
                title = "Cheezy Premium",
                announce = "Привет! Плановые работы 25 июня с 02:00 до 04:00 UTC. Возможны кратковременные разрывы соединения.",
                upload = 50L * 1024 * 1024 * 1024,
                download = 150L * 1024 * 1024 * 1024,
                total = 500L * 1024 * 1024 * 1024,
                expire = (Instant.now().epochSecond) + 86400 * 5
            ),
            lastUpdateTime = System.currentTimeMillis() - 3600000,
            lastError = null,
            configName = "config.yaml",
            loading = false,
            onRefresh = {},
            onVpnToggle = {}
        )
    }
}

@Preview(showBackground = true, name = "Home Tab - Disconnected with error")
@Composable
fun HomeTabDisconnectedPreview() {
    CheezyVPNTheme {
        HomeTab(
            running = false,
            proxyname = "",
            trafficNowFlow = MutableStateFlow(0L),
            subscription = SubscriptionInfo(
                title = "Cheezy Free",
                announce = null,
                upload = 800L * 1024 * 1024,
                download = 3200L * 1024 * 1024,
                total = 5L * 1024 * 1024 * 1024,
                expire = (Instant.now().epochSecond) + 86400 * 2
            ),
            lastUpdateTime = System.currentTimeMillis() - 7200000,
            lastError = "VPN core crashed: failed to bind TUN interface",
            configName = "config.yaml",
            loading = false,
            onRefresh = {},
            onVpnToggle = {}
        )
    }
}
