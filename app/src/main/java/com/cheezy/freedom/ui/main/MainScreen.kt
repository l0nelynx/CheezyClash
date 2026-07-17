package com.cheezy.freedom.ui.main

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import androidx.annotation.StringRes
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.cheezy.freedom.R
import com.cheezy.freedom.account.AppDeps
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ConfigManager
import com.cheezy.freedom.clash.ProfileStore
import com.cheezy.freedom.ui.main.dialogs.ShareVpnDialog
import com.cheezy.freedom.ui.main.profiles.ProfilesTab
import com.cheezy.freedom.ui.main.settings.AccessControlScreen
import com.cheezy.freedom.ui.main.dialogs.UpdateDialog
import com.cheezy.freedom.ui.main.dialogs.UrlDialog
import com.cheezy.freedom.ui.main.home.HomeTab
import com.cheezy.freedom.ui.main.proxies.ProxiesTab
import com.cheezy.freedom.ui.main.settings.SettingsTab
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private enum class MainTab(@StringRes val titleRes: Int, val icon: ImageVector) {
    HOME(R.string.tab_home, Icons.Default.Home),
    PROXIES(R.string.tab_proxies, Icons.Default.List),
    PROFILES(R.string.tab_profiles, Icons.Default.Layers),
    SETTINGS(R.string.tab_settings, Icons.Default.Settings)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    viewModel: MainViewModel = viewModel(),
    deepLinkFlow: StateFlow<String?>? = null,
    onDeepLinkHandled: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState(pageCount = { MainTab.entries.size })

    val proxyname by ClashState.activeProxy.collectAsState()
    val running by ClashState.running.collectAsState()
    val phase by ClashState.phase.collectAsState()
    val tunAddress by ClashState.tunAddress.collectAsState()
    val localIp by ClashState.localIp.collectAsState()
    // trafficNow ticks ~once per second. We don't collect it at the MainScreen
    // level via collectAsState — otherwise, every tick would recompose the
    // entire Scaffold/Pager. We pass the StateFlow down and read it at the
    // actual consumer (Text inside ConnectButton), thus limiting
    // recomposition to a single Text node.
    val trafficNowFlow = ClashState.trafficNow
    val subscription by ClashState.subscription.collectAsState()
    val lastUpdateTime by ClashState.lastUpdateTime.collectAsState()
    val lastError by ClashState.lastError.collectAsState()

    val configName by viewModel.configName.collectAsState()
    val userEmail by viewModel.userEmail.collectAsState()
    val tgId by viewModel.tgId.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val proxiesPinging by viewModel.isPinging.collectAsState()
    val isCheckingUpdate by viewModel.isCheckingUpdate.collectAsState()
    val updateInfo by viewModel.updateInfo.collectAsState()
    val showUrlDialog by viewModel.showUrlDialog.collectAsState()
    val needsAuth by viewModel.needsAuth.collectAsState()
    // Hoisted here so the (non-composable) onVpnToggle lambda can use it.
    val noConfigMsg = stringResource(R.string.home_error_no_config)

    var showShareDialog by remember { mutableStateOf(false) }
    var showTransferDialog by remember { mutableStateOf(false) }
    var showAccessControlDialog by remember { mutableStateOf(false) }

    val snackbarHostState = remember { SnackbarHostState() }

    val activity = context as? Activity
    val authLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            viewModel.onAuthCompleted()
        } else {
            activity?.finish()
        }
    }

    val subscriptionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK &&
            result.data?.getBooleanExtra("payment_success", false) == true
        ) {
            viewModel.onPaymentSuccess()
        }
    }

    val notificationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    val prepareVpn = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        viewModel.onVpnPermissionResult(result.resultCode == Activity.RESULT_OK)
    }

    /*
     * Local Network Permission (Android 16+ / API 36+).
     *
     * Without this grant the kernel silently drops SYN-ACK reply packets sent by the in-process
     * mihomo proxy listener (mixed-port) to LAN clients — `curl -x socks5://<phone-LAN-ip>:2080`
     * from another LAN host times out with EPERM under the hood.
     *
     * On Android 16 the permission key is NEARBY_WIFI_DEVICES; on Android 17+ it is ACCESS_LOCAL_NETWORK.
     * Both sit in the NEARBY_DEVICES UI group, so we just request whichever is appropriate.
     *
     * If the user refuses, we still let VPN start — loopback proxy (127.0.0.1:2080) keeps working,
     * the only thing lost is inbound LAN reachability, which is opt-in feature for the user.
     */
    val localNetworkPermName: String? = remember {
        when {
            Build.VERSION.SDK_INT >= 37 -> "android.permission.ACCESS_LOCAL_NETWORK"
            Build.VERSION.SDK_INT >= 33 -> Manifest.permission.NEARBY_WIFI_DEVICES
            else -> null
        }
    }

    fun localNetworkGranted(): Boolean {
        val perm = localNetworkPermName ?: return true
        return ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
    }

    fun startVpnAfterPermissions() {
        ClashState.setError(null)
        val prep = VpnService.prepare(context)
        if (prep != null) prepareVpn.launch(prep)
        else viewModel.startVpnService()
    }

    val localNetworkPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            android.util.Log.w(
                "CheezyVPN",
                "Local network permission denied — inbound LAN access to proxy listener will not work"
            )
        }
        // Always proceed: VPN works via loopback regardless.
        startVpnAfterPermissions()
    }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is MainEffect.LaunchVerify ->
                    viewModel.verifyIntent(effect.email)?.let { context.startActivity(it) }
                is MainEffect.ShowSnackbar -> snackbarHostState.showSnackbar(effect.text)
                is MainEffect.CloseDialogs -> {
                    showTransferDialog = false
                    viewModel.dismissUrlDialog()
                }
                is MainEffect.LaunchIntent -> {
                    runCatching { context.startActivity(effect.intent) }
                }
                is MainEffect.OpenUrl -> {
                    val originalUrl = effect.url
                    android.util.Log.d("CheezyVPN", "Opening URL: $originalUrl")
                    
                    val uri = if (originalUrl.startsWith("https://t.me/")) {
                        // Correct transformation: replace prefix and change the first '?' to '&'
                        val pathAndQuery = originalUrl.substring("https://t.me/".length)
                        val tgUrl = "tg://resolve?domain=${pathAndQuery.replace("?", "&")}"
                        android.util.Log.d("CheezyVPN", "Transformed to TG URI: $tgUrl")
                        android.net.Uri.parse(tgUrl)
                    } else {
                        android.net.Uri.parse(originalUrl)
                    }

                    val intent = Intent(Intent.ACTION_VIEW, uri)
                    runCatching {
                        context.startActivity(intent)
                    }.onFailure { e ->
                        android.util.Log.e("CheezyVPN", "Failed to open direct TG link: ${e.message}")
                        // If direct transition fails, open via browser
                        if (uri.scheme == "tg") {
                            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(originalUrl)))
                        }
                    }
                }
            }
        }
    }

    LaunchedEffect(needsAuth) {
        if (!needsAuth) return@LaunchedEffect
        // proprietary: launch AuthActivity. open: authIntent==null — show UrlDialog.
        val intent = viewModel.authIntent()
        if (intent != null) authLauncher.launch(intent)
        else viewModel.openUrlDialog()
    }

    LaunchedEffect(Unit) {
        viewModel.bootstrap()
        if (Build.VERSION.SDK_INT >= 33) {
            val granted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    if (deepLinkFlow != null) {
        LaunchedEffect(deepLinkFlow) {
            deepLinkFlow.collect { raw ->
                val link = parseDeepLink(raw) ?: return@collect
                viewModel.handleDeepLink(link)
                onDeepLinkHandled()
            }
        }
    }

    if (showUrlDialog) {
        val prefill by viewModel.urlDialogPrefill.collectAsState()
        UrlDialog(
            initial = prefill,
            onDismiss = { viewModel.dismissUrlDialog() },
            onConfirm = { url -> viewModel.importFromUrl(url) }
        )
    }

    UpdateDialog(updateInfo, onDismiss = { viewModel.dismissUpdateDialog() })

    if (showAccessControlDialog) {
        AccessControlScreen(onDismiss = { showAccessControlDialog = false })
    }

    if (showShareDialog) {
        LaunchedEffect(showShareDialog) { viewModel.refreshShareInfo() }
        val shareInfo by viewModel.shareInfo.collectAsState()
        ShareVpnDialog(
            tunAddress = tunAddress ?: "",
            localIp = localIp ?: "",
            subscriptionUrl = ProfileStore.active(context)?.url.orEmpty(),
            info = shareInfo,
            onToggleLocalProxy = viewModel::toggleLocalProxy,
            onDismiss = { showShareDialog = false }
        )
    }

    // The subscription transfer dialog is rendered only in the proprietary flavor — there
    // AppLaunchers.TransferSubscriptionDialog != null. In open, it's always null + the
    // transfer button is hidden via showTelegramLink=false, so it won't reach here.
    val transferDialogSlot = AppDeps.launchers.TransferSubscriptionDialog
    if (showTransferDialog && transferDialogSlot != null) {
        transferDialogSlot(
            loading,
            { showTransferDialog = false },
            { viewModel.startTelegramLink() },
            { url, email -> viewModel.linkByUrl(url, email) },
        )
    }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            snackbarHost = {
                // Lift the snackbar above the floating nav bar (≈64dp card + 12dp×2
                // padding) so toasts like "enable VPN first" aren't hidden behind it.
                SnackbarHost(
                    snackbarHostState,
                    modifier = Modifier
                        .navigationBarsPadding()
                        .padding(bottom = 88.dp)
                )
            },
        ) { padding ->
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(bottom = 100.dp),
                // Card-like carousel: neighbouring pages peek at the edges and a
                // gap separates them, so swiping reads as moving between cards.
                contentPadding = PaddingValues(horizontal = 12.dp),
                pageSpacing = 12.dp,
                beyondViewportPageCount = 1
            ) { page ->
                when (MainTab.entries[page]) {
                    MainTab.HOME -> TabCard(title = subscription?.title ?: stringResource(R.string.app_name)) {
                        HomeTab(
                            running = running,
                            proxyname = proxyname ?: "",
                            trafficNowFlow = trafficNowFlow,
                            subscription = subscription,
                            lastUpdateTime = lastUpdateTime,
                            lastError = lastError,
                            configName = configName,
                            loading = loading,
                            phase = phase,
                            onRefresh = { viewModel.refresh() },
                            onVpnToggle = {
                                if (running) {
                                    viewModel.stopVpnService()
                                } else if (!ConfigManager.hasConfig(context)) {
                                    ClashState.setError(noConfigMsg)
                                } else if (localNetworkPermName != null && !localNetworkGranted()) {
                                    // Request local network access (Android 16+/17+).
                                    // After user response, VPN starts — refusal doesn't block operation through loopback.
                                    localNetworkPermissionLauncher.launch(localNetworkPermName)
                                } else {
                                    startVpnAfterPermissions()
                                }
                            }
                        )
                    }
                    MainTab.PROXIES -> TabCard(
                        title = stringResource(MainTab.PROXIES.titleRes),
                        action = {
                            IconButton(onClick = { viewModel.measurePings() }, enabled = !proxiesPinging) {
                                if (proxiesPinging) {
                                    CircularWavyProgressIndicator(modifier = Modifier.size(24.dp))
                                } else {
                                    Icon(Icons.Default.Speed, contentDescription = stringResource(R.string.proxies_check_ping))
                                }
                            }
                        }
                    ) {
                        ProxiesTab(running)
                    }
                    MainTab.PROFILES -> TabCard(
                        title = stringResource(MainTab.PROFILES.titleRes),
                        action = if (AppDeps.accountProvider.supportsMultipleProfiles) {
                            {
                                IconButton(onClick = { viewModel.openUrlDialog() }) {
                                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.profiles_add))
                                }
                            }
                        } else null
                    ) {
                        ProfilesTab(viewModel)
                    }
                    MainTab.SETTINGS -> TabCard(title = stringResource(MainTab.SETTINGS.titleRes)) {
                        SettingsTab(
                            userEmail = userEmail,
                            tgId = tgId,
                            isCheckingUpdate = isCheckingUpdate,
                            showAccountCard = AppDeps.accountProvider.supportsAuthFlow,
                            showDevices = AppDeps.accountProvider.supportsDeviceManagement,
                            showSubscription = AppDeps.accountProvider.supportsBilling,
                            showTelegramLink = AppDeps.accountProvider.supportsTelegramLink,
                            showLogout = AppDeps.accountProvider.supportsAuthFlow,
                            onAddConfig = { viewModel.openUrlDialog() },
                            onCheckUpdate = { viewModel.checkUpdate() },
                            onLogout = { viewModel.logout() },
                            onOpenSubscription = {
                                viewModel.subscriptionIntent()?.let { subscriptionLauncher.launch(it) }
                            },
                            onOpenDevices = {
                                viewModel.devicesIntent()?.let { context.startActivity(it) }
                            },
                            onShareVpn = { showShareDialog = true },
                            onUnlinkTelegram = { viewModel.unlinkTelegram() },
                            onRequestTransfer = { showTransferDialog = true },
                            onOpenAccessControl = { showAccessControlDialog = true },
                        )
                    }
                }
            }
        }

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            contentAlignment = Alignment.Center
        ) {
            ElevatedCard(
                modifier = Modifier.width(320.dp),
                shape = RoundedCornerShape(32.dp),
                colors = CardDefaults.elevatedCardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHighest
                ),
                elevation = CardDefaults.elevatedCardElevation(defaultElevation = 6.dp)
            ) {
                // Selected tab follows the pager (flips at the midpoint of a swipe).
                // Everything else — cell widths and the indicator — is derived from
                // one shared set of animated weights, so they stay perfectly in sync.
                val lastIndex = MainTab.entries.lastIndex
                val currentIndex =
                    (pagerState.currentPage + pagerState.currentPageOffsetFraction)
                        .coerceIn(0f, lastIndex.toFloat())
                        .roundToInt()
                FloatingNavBar(
                    selectedIndex = currentIndex,
                    onSelect = { index ->
                        scope.launch { pagerState.animateScrollToPage(index) }
                    }
                )
            }
        }
    }
}

/**
 * A page wrapped as a rounded card with its title baked into the header. The
 * old top app bar is gone — the title lives inside the card so the card reads
 * as a self-contained surface and the swipe feels like flipping between cards.
 */
@Composable
private fun TabCard(
    title: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surfaceContainer
    ) {
        androidx.compose.foundation.layout.Column(Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 24.dp, end = 8.dp, top = 18.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                action?.invoke()
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                content()
            }
        }
    }
}

/**
 * Bottom navigation: the active tab widens to reveal its label, the others
 * collapse to an icon. Cell widths come from one set of animated weights, and
 * the sliding highlight is computed from those same weights — so the pill and
 * the cells move together with no measuring and no chasing (the old source of
 * jank). The label crossfades in over the same duration.
 */
@Composable
private fun FloatingNavBar(
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
) {
    val tabs = MainTab.entries
    val weights = tabs.mapIndexed { index, _ ->
        animateFloatAsState(
            targetValue = if (index == selectedIndex) 1.9f else 1f,
            animationSpec = tween(durationMillis = 260),
            label = "navWeight_$index"
        ).value
    }
    val weightSum = weights.sum()

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
    ) {
        val total = maxWidth
        val leftFraction = weights.take(selectedIndex).sum() / weightSum
        val widthFraction = weights[selectedIndex] / weightSum
        val inset = 4.dp

        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = total * leftFraction + inset)
                .width(total * widthFraction - inset * 2)
                .height(48.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(MaterialTheme.colorScheme.primaryContainer)
        )

        Row(
            modifier = Modifier
                .fillMaxSize()
                .selectableGroup()
        ) {
            tabs.forEachIndexed { index, tab ->
                FloatingNavItem(
                    tab = tab,
                    selected = index == selectedIndex,
                    onClick = { onSelect(index) },
                    modifier = Modifier.weight(weights[index])
                )
            }
        }
    }
}

@Composable
private fun FloatingNavItem(
    tab: MainTab,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentColor by animateColorAsState(
        targetValue = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                      else MaterialTheme.colorScheme.onSurfaceVariant,
        animationSpec = tween(durationMillis = 220),
        label = "navFg_${tab.name}"
    )
    val title = stringResource(tab.titleRes)
    Row(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(24.dp))
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics { this.selected = selected }
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = tab.icon,
            contentDescription = title,
            tint = contentColor,
            modifier = Modifier.size(22.dp)
        )
        AnimatedVisibility(
            visible = selected,
            enter = fadeIn(tween(220)) + expandHorizontally(animationSpec = tween(220), clip = false),
            exit = fadeOut(tween(220)) + shrinkHorizontally(animationSpec = tween(220), clip = false)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.width(6.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = contentColor,
                    maxLines = 1,
                    softWrap = false
                )
            }
        }
    }
}
