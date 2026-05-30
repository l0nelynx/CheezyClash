@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package com.cheezy.freedom.ui.main.home

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StampedPathEffectStyle.Companion.Morph
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.sp
import androidx.graphics.shapes.Morph
import com.cheezy.freedom.clash.SubscriptionInfo
import com.cheezy.freedom.ui.library.MorphPolygonShape
import com.cheezy.freedom.ui.library.RotatingMorphPolygonShape
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
    val pullState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = loading,
        onRefresh = onRefresh,
        state = pullState,
        modifier = Modifier.fillMaxSize()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            HomeHeader(
                title = subscription?.title,
                announce = subscription?.announce,
                proxyname = proxyname,
                lastUpdateTime = lastUpdateTime,
                running = running
            )

            Spacer(Modifier.weight(1f))

            ConnectButton(
                running = running,
                trafficNowFlow = trafficNowFlow,
                subscription = subscription,
                enabled = configName != null,
                onClick = onVpnToggle
            )

            Spacer(Modifier.height(8.dp))

            subscription?.let { TrafficSection(it, lastUpdateTime) }

            lastError?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun HomeHeader(
    title: String?,
    announce: String?,
    proxyname: String,
    lastUpdateTime: Long,
    running: Boolean
) {
    announce?.takeIf { it.isNotBlank() }?.let {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 120.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            )
        ) {
            Text(
                it,
                modifier = Modifier
                    .padding(14.dp)
                    .verticalScroll(rememberScrollState()),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center
            )
        }
    }

//    if (lastUpdateTime > 0) {
//        Text(
//            "Updated: ${formatLastUpdate(lastUpdateTime)}",
//            style = MaterialTheme.typography.labelSmall,
//            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
//            textAlign = TextAlign.Center,
//            fontSize = 8.sp
//        )
//    }
    if (running) {
        Text(
            proxyname,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
            fontSize = 14.sp
        )
    }
}

@ExperimentalMaterial3ExpressiveApi
//sealed class MaterialShapes
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
    val rawProgress = when { // Not remembered during minimize/restart - fix this
        total <= 0L -> 0.999f
        total >= 1000L * 1024 * 1024 * 1024 -> 0.99f
        else -> (used.toFloat() / total.toFloat()).coerceIn(0f, 1f)
    }
    val animatedProgress by animateFloatAsState(targetValue = rawProgress, label = "trafficRing")

    val buttonColor by animateColorAsState(
        targetValue = if (running) MaterialTheme.colorScheme.primaryContainer
        else MaterialTheme.colorScheme.surfaceContainerHighest,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "buttonColor"
    )

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
    // Angle is calculated below via rotationAngle(active) — the composable starts
    // rememberInfiniteTransition ONLY when active=true. When VPN is not connected
    // and not connecting, the infinite transition is not created at all, does not
    // wake up every frame via withFrameNanos, and does not invalidate the button's graphicsLayer.
    //val Ghostish: RoundedPolygon
    val scale by animateFloatAsState(
        targetValue = if (running) 1.05f else 0.75f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessVeryLow),
        label = "buttonScale"
    )
    // Connection state
    var isConnecting by remember { mutableStateOf(false) }
    // Reset connection state on running or error
    LaunchedEffect(running, lastError) {
        if (running || lastError != null) {
            isConnecting = false
        }
    }
    // Rotation condition
    val isRotating = running || isConnecting
    val angle = rotationAngle(isRotating)
    // MaterialShapes.Cookie* are object/singletons, no need to wrap in remember.
    // Morph depends only on start/end shapes — both are constants, keys don't change.
    val morph = remember { Morph(MaterialShapes.Cookie4Sided, MaterialShapes.Cookie7Sided) }
    val morphProgress by animateFloatAsState(
        targetValue = if (running) 1f else 0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessVeryLow
        ),
        label = "morphProgress"
    )
    val morphShape = remember(morphProgress) {
        MorphPolygonShape(morph, morphProgress)
    }
    // toPx() reads density only when Configuration changes — cache it
    // to avoid recalculating on every button recompose.
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
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                },
                //.scale(scale),
            wavelength = 64.dp,
            gapSize = 8.dp,
            stroke = Stroke(
                width = strokeWidthPx,
                cap = StrokeCap.Round,
                join = StrokeJoin.Round
            ),
            trackColor = MaterialTheme.colorScheme.inversePrimary,
            waveSpeed = (96 / (animatedProgress + 1)).dp,
            amplitude = { if (running) { 4.0f } else 0f },
            color = if (running) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.tertiary
        )
        Surface(
            onClick = {
                if (!running) isConnecting = true // Start rotating on enable
                onClick()
            },
            enabled = enabled,
            //shape = MaterialShapes.Cookie6Sided.toShape(),
            shape = morphShape,
            //color = MaterialTheme.colorScheme.inversePrimary,
            color = contentColorinverse,
            modifier = Modifier
                .size(192.dp)
                //.scale(scale)
                //.rotate(if (running) angle else 0f) // Rotating is in morphShape now
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    //rotationZ = if (running) angle else 0f
                    rotationZ = if (isRotating) angle else 0f
                    // graphicsLayer rotates around the center of bounds by default
                    //transformOrigin = TransformOrigin.Center
                }
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        // Counter-rotate for static text placing
                        //rotationZ = if (running) -angle else 0f
                        rotationZ = if (isRotating) -angle else 0f
                        //transformOrigin = TransformOrigin.Center
                    }
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
                    // Reading trafficNow is moved to TrafficText so that the
                    // ClashState.trafficNow tick once per second recomposes only
                    // this Text, and not ConnectButton or parent layers.
                    TrafficText(
                        trafficNowFlow = trafficNowFlow,
                        color = contentColor.copy(alpha = 0.8f)
                    )
                }
            }
        }
    }
//    Surface(
//        onClick = onClick,
//        enabled = enabled,
//        shape = morphShape,
//        color = contentColorinverse,
//        modifier = Modifier
//            .size(ConnectButtonSize - ProgressRingStroke * 8)
//            .graphicsLayer {
//                rotationZ = if (running) angle else 0f
//                transformOrigin = TransformOrigin.Center
//            }
//    ) { }
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
                upload = 50L * 1024 * 1024 * 1024,
                download = 150L * 1024 * 1024 * 1024,
                total = 500L * 1024 * 1024 * 1024,
                expire = (Instant.now().epochSecond) + 86400 * 15
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

@Preview(showBackground = true, name = "Home Tab - Disconnected")
@Composable
fun HomeTabDisconnectedPreview() {
    CheezyVPNTheme {
        HomeTab(
            running = false,
            proxyname = "Direct",
            trafficNowFlow = MutableStateFlow(0L),
            subscription = null,
            lastUpdateTime = 0L,
            lastError = "Connection timed out",
            configName = null,
            loading = false,
            onRefresh = {},
            onVpnToggle = {}
        )
    }
}

/**
 * Isolated trafficNow reader. The flow tick every second recomposes only
 * this Composable (reads state at the very bottom of the composable tree),
 * without affecting ConnectButton, HomeTab, or MainScreen.
 */
@Composable
private fun TrafficText(trafficNowFlow: StateFlow<Long>, color: Color) {
    val trafficNow by trafficNowFlow.collectAsState()
    Text(
        formatKbps(trafficNow),
        style = MaterialTheme.typography.labelSmall,
        color = color
    )
}

/**
 * Returns a rotation angle running 0→360° in 20 seconds only when [active] = true.
 *
 * When [active] = false — returns 0f and does NOT create rememberInfiniteTransition.
 * This is critical for idle screen performance: otherwise, the transition would wake
 * Compose every frame via withFrameNanos, even if the result wasn't applied
 * (rotationZ was fixed at 0). Extracted to a separate Composable because
 * conditional remember calls in a single composition break the Compose contract.
 */
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
private fun TrafficSection(info: SubscriptionInfo, lastUpdateTime: Long) {
    val used = info.upload + info.download
    val unixTimeSeconds = Instant.now().epochSecond
    //val timeLeftDays = (info.expire - unixTimeSeconds)/86400
    val isUnlimited = info.total <= 0L
    //val progress = if (isUnlimited) 1f else (used.toFloat() / info.total.toFloat()).coerceIn(0f, 1f)
    //val animated by animateFloatAsState(targetValue = progress, label = "trafficBar")

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
//        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
//            LinearProgressIndicator(
//                progress = { animated },
//                modifier = Modifier.fillMaxWidth().height(14.dp),
//                trackColor = MaterialTheme.colorScheme.surfaceVariant,
//            )
//            if (isUnlimited) {
//                Text(
//                    "∞",
//                    style = MaterialTheme.typography.labelMedium,
//                    fontWeight = FontWeight.Bold,
//                    color = MaterialTheme.colorScheme.onPrimary
//                )
//            }
//        }
        Text(
            text = if (isUnlimited) "${formatBytes(used)} / ∞"
            else "${formatBytes(used)} / ${formatBytes(info.total)}",
            style = MaterialTheme.typography.bodyMedium
        )
        if (info.expire > 0) {
            Text(
                "Истекает: ${formatExpire(info.expire)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (lastUpdateTime > 0) {
            Text(
                "Обновлено: ${formatLastUpdate(lastUpdateTime)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                fontSize = 10.sp
            )
        }
    }
}
