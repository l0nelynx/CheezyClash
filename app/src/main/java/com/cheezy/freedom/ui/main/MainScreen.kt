package com.cheezy.freedom.ui.main

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.Spring
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
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
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.cheezy.freedom.account.AppDeps
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ClashVpnService
import com.cheezy.freedom.clash.ConfigManager
import com.cheezy.freedom.ui.main.dialogs.ShareVpnDialog
import com.cheezy.freedom.ui.main.dialogs.UpdateDialog
import com.cheezy.freedom.ui.main.dialogs.UrlDialog
import com.cheezy.freedom.ui.main.home.HomeTab
import com.cheezy.freedom.ui.main.proxies.ProxiesTab
import com.cheezy.freedom.ui.main.settings.SettingsTab
import kotlinx.coroutines.launch

private enum class MainTab(val title: String, val icon: ImageVector) {
    HOME("Главная", Icons.Default.Home),
    PROXIES("Правила", Icons.Default.List),
    SETTINGS("Настройки", Icons.Default.Settings)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: MainViewModel = viewModel()) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState(pageCount = { MainTab.entries.size })
    var selectedTab by remember { mutableStateOf(MainTab.HOME) }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { page ->
            selectedTab = MainTab.entries[page]
        }
    }
    val proxyname by ClashState.activeProxy.collectAsState()
    val running by ClashState.running.collectAsState()
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

    var showShareDialog by remember { mutableStateOf(false) }
    var showTransferDialog by remember { mutableStateOf(false) }

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
        else ClashVpnService.start(context)
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

    if (showUrlDialog) {
        UrlDialog(
            initial = ConfigManager.lastUrl(context).orEmpty(),
            onDismiss = { viewModel.dismissUrlDialog() },
            onConfirm = { url -> viewModel.importFromUrl(url) }
        )
    }

    UpdateDialog(updateInfo, onDismiss = { viewModel.dismissUpdateDialog() })

    if (showShareDialog) {
        LaunchedEffect(showShareDialog) { viewModel.refreshShareInfo() }
        val shareInfo by viewModel.shareInfo.collectAsState()
        ShareVpnDialog(
            tunAddress = tunAddress ?: "",
            localIp = localIp ?: "",
            subscriptionUrl = ConfigManager.lastUrl(context).orEmpty(),
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
            snackbarHost = { SnackbarHost(snackbarHostState) },
            topBar = {
                CenterAlignedTopAppBar(
                    title = {
                        val title = if (selectedTab == MainTab.HOME) (subscription?.title ?: "CheezyVPN") else selectedTab.title
                        AnimatedContent(
                            targetState = title,
                            transitionSpec = {
                                if (pagerState.targetPage > pagerState.currentPage) {
                                    (slideInVertically { height -> height } + fadeIn() togetherWith
                                            slideOutVertically { height -> -height } + fadeOut())
                                } else {
                                    (slideInVertically { height -> -height } + fadeIn() togetherWith
                                            slideOutVertically { height -> height } + fadeOut())
                                }.using(SizeTransform(clip = false))
                            },
                            contentAlignment = androidx.compose.ui.Alignment.Center,
                            label = "topBarTitle"
                        ) { targetTitle ->
                            Text(
                                text = targetTitle,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    },
                    actions = {
                        if (selectedTab == MainTab.PROXIES) {
                            IconButton(onClick = { viewModel.measurePings() }, enabled = !proxiesPinging) {
                                if (proxiesPinging) {
                                    CircularWavyProgressIndicator(
                                        modifier = Modifier.size(24.dp)
                                    )
                                } else {
                                    Icon(Icons.Default.Speed, contentDescription = "Проверить ping")
                                }
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface
                    )
                )
            }
        ) { padding ->
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(bottom = 80.dp),
                beyondViewportPageCount = 2
            ) { page ->
                when (MainTab.entries[page]) {
                    MainTab.HOME -> HomeTab(
                        running = running,
                        proxyname = proxyname ?: "",
                        trafficNowFlow = trafficNowFlow,
                        subscription = subscription,
                        lastUpdateTime = lastUpdateTime,
                        lastError = lastError,
                        configName = configName,
                        loading = loading,
                        onRefresh = { viewModel.refresh() },
                        onVpnToggle = {
                            if (running) {
                                ClashVpnService.stop(context)
                            } else if (!ConfigManager.hasConfig(context)) {
                                ClashState.setError("First load the configuration")
                            } else if (localNetworkPermName != null && !localNetworkGranted()) {
                                // Request local network access (Android 16+/17+).
                                // After user response, VPN starts — refusal doesn't block operation through loopback.
                                localNetworkPermissionLauncher.launch(localNetworkPermName)
                            } else {
                                startVpnAfterPermissions()
                            }
                        }
                    )
                    MainTab.PROXIES -> ProxiesTab(running)
                    MainTab.SETTINGS -> SettingsTab(
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
                    )
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
                modifier = Modifier.width(280.dp),
                shape = RoundedCornerShape(32.dp),
                elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp)
                        .height(64.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    MainTab.entries.forEach { tab ->
                        FloatingNavItem(
                            tab = tab,
                            selected = selectedTab == tab,
                            onClick = {
                                scope.launch { pagerState.animateScrollToPage(tab.ordinal) }
                            }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FloatingNavItem(tab: MainTab, selected: Boolean, onClick: () -> Unit) {
    val backgroundColor by animateColorAsState(
        targetValue = if (selected) MaterialTheme.colorScheme.primaryContainer
                      else Color.Transparent,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "navBg_${tab.name}"
    )
    val contentColor by animateColorAsState(
        targetValue = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                      else MaterialTheme.colorScheme.onSurfaceVariant,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "navFg_${tab.name}"
    )
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(24.dp),
        color = backgroundColor
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = tab.icon,
                contentDescription = tab.title,
                tint = contentColor,
                modifier = Modifier.size(22.dp)
            )
            AnimatedVisibility(
                visible = selected,
                enter = fadeIn() + expandHorizontally(),
                exit = fadeOut() + shrinkHorizontally()
            ) {
                Text(
                    text = tab.title,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = contentColor
                )
            }
        }
    }
}
