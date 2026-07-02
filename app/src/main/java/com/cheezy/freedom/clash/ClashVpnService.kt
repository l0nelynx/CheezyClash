package com.cheezy.freedom.clash

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.TileService
import android.util.Log
import android.os.RemoteCallbackList
import android.os.RemoteException
import com.cheezy.freedom.MainActivity
import com.cheezy.freedom.R
import com.cheezy.freedom.VpnTileService
import com.github.kr328.clash.core.Clash
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.io.File

class ClashVpnService : VpnService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var startJob: Job? = null
    private var trafficJob: Job? = null
    private var logJob: Job? = null

    // AC settings captured from the start Intent (written by the main process).
    // SharedPreferences cannot be relied on across processes — the :vpn process
    // has its own stale cache. The main process passes fresh values via extras.
    private var acEnabled = false
    private var acForceIncluded: Set<String> = emptySet()
    private var acForceExcluded: Set<String> = emptySet()

    // Directory of the active profile's config (profiles/<id>/). The core HOME
    // stays filesDir/clash (shared static), but the *load* directory is per
    // profile. The main process passes the active dir via Intent extras (start)
    // or loadConfig(path); we only fall back to reading it from disk on a fresh
    // (OS-restarted) process, where SharedPreferences are authoritative.
    @Volatile
    private var activeConfigDir: File = File("")

    // Signature (mtime:size) of the config.yaml currently loaded into the core.
    // Lets us skip a redundant native reload on the hot start path when the
    // Proxies tab (or a warm-up) has already loaded the same config.
    @Volatile
    private var loadedConfigSig: String? = null

    private fun configSignature(): String {
        val f = activeConfigDir.resolve("config.yaml")
        return "${f.lastModified()}:${f.length()}"
    }

    /**
     * Loads config.yaml from [activeConfigDir] into the core only if it isn't
     * already loaded with the same content. Shared by the binder's loadConfig
     * (warm-up / Proxies tab) and startClash, so the config is parsed once, not
     * on every entry point.
     */
    private suspend fun ensureConfigLoaded() {
        val sig = configSignature()
        val alreadyLoaded = loadedConfigSig == sig &&
            runCatching { Clash.queryGroupNames(false).isNotEmpty() }.getOrDefault(false)
        if (alreadyLoaded) return
        Clash.load(activeConfigDir)
        loadedConfigSig = sig
    }

    private val callbacks = RemoteCallbackList<IClashCallback>()
    private val logCallbacks = RemoteCallbackList<ILogcatCallback>()

    private val binder = object : IClashInterface.Stub() {
        override fun registerCallback(callback: IClashCallback) {
            callbacks.register(callback)
            // Immediately send current state to the new subscriber
            try {
                callback.onStateChanged(ClashState.running.value, ClashState.lastError.value)
                callback.onPhaseChanged(ClashState.phase.value.ordinal)
                callback.onActiveProxyChanged(ClashState.activeProxy.value)
                callback.onIpAddressesUpdated(ClashState.tunAddress.value, ClashState.localIp.value)
            } catch (e: RemoteException) {}
        }

        override fun unregisterCallback(callback: IClashCallback) {
            callbacks.unregister(callback)
        }

        override fun isRunning(): Boolean = ClashState.running.value

        override fun stopVpn() {
            stopClash()
        }

        override fun loadConfig(path: String) = runBlocking {
            // path is the active profile's directory; adopt it and load config.yaml
            // from there (dedup against the loaded signature).
            if (path.isNotBlank()) activeConfigDir = File(path)
            ensureConfigLoaded()
        }

        override fun queryGroupNames(excludeNotSelectable: Boolean): String = runBlocking {
            com.github.kr328.clash.core.bridge.Bridge.nativeQueryGroupNames(excludeNotSelectable)
        }

        override fun queryGroup(name: String, sort: String): String? = runBlocking {
            com.github.kr328.clash.core.bridge.Bridge.nativeQueryGroup(name, sort)
        }

        override fun patchSelector(group: String, name: String): Boolean = runBlocking {
            val ok = Clash.patchSelector(group, name)
            if (ok) {
                // Save selection in this process so that at next VPN start
                // SharedPreferences are up-to-date for the :vpn process.
                ConfigManager.saveSelectedProxy(this@ClashVpnService, group, name)
                
                // If the proxy in the first (main) group was changed, update status immediately
                scope.launch {
                    val first = Clash.queryGroupNames(true).firstOrNull()
                    if (group == first) {
                        ClashState.setActiveProxy(name)
                    }
                }
            }
            ok
        }

        override fun healthCheck(name: String) {
            scope.launch { Clash.healthCheck(name) }
        }

        override fun subscribeLogcat(callback: ILogcatCallback) {
            logCallbacks.register(callback)
            ensureLogSubscription()
        }
    }

    private fun ensureLogSubscription() {
        if (logJob?.isActive == true) return
        logJob = scope.launch {
            com.github.kr328.clash.core.bridge.Bridge.nativeSubscribeLogcat(object : com.github.kr328.clash.core.bridge.LogcatInterface {
                override fun received(jsonPayload: String) {
                    synchronized(logCallbacks) {
                        val n = logCallbacks.beginBroadcast()
                        try {
                            for (i in 0 until n) {
                                try {
                                    logCallbacks.getBroadcastItem(i).onLogReceived(jsonPayload)
                                } catch (e: RemoteException) {
                                }
                            }
                        } finally {
                            logCallbacks.finishBroadcast()
                        }
                    }
                }
            })
        }
    }

    override fun onBind(intent: Intent?): android.os.IBinder? {
        if (intent?.action == "com.cheezy.freedom.clash.IClashInterface") {
            return binder
        }
        return super.onBind(intent)
    }

    override fun onCreate() {
        super.onCreate()
        ClashCore.init(this)
        // Default to the active profile dir from disk; overridden by the start
        // Intent extra / loadConfig(path) during normal operation.
        activeConfigDir = ProfileStore.activeDir(this)
        ensureChannel()
        
        // Forward ClashState changes (in this process) to all remote callbacks
        scope.launch {
            ClashState.running.collect { r ->
                val err = ClashState.lastError.value
                broadcast { it.onStateChanged(r, err) }
            }
        }
        scope.launch {
            ClashState.phase.collect { p ->
                broadcast { it.onPhaseChanged(p.ordinal) }
            }
        }
        scope.launch {
            ClashState.trafficNow.collect { t ->
                broadcast { it.onTrafficUpdated(t) }
            }
        }
        scope.launch {
            ClashState.activeProxy.collect { p ->
                broadcast { it.onActiveProxyChanged(p) }
            }
        }
        scope.launch {
            kotlinx.coroutines.flow.combine(
                ClashState.tunAddress,
                ClashState.localIp
            ) { tun, local -> tun to local }.collect { (tun, local) ->
                broadcast { it.onIpAddressesUpdated(tun, local) }
            }
        }
    }

    private fun broadcast(action: (IClashCallback) -> Unit) = synchronized(callbacks) {
        val n = callbacks.beginBroadcast()
        try {
            for (i in 0 until n) {
                try {
                    action(callbacks.getBroadcastItem(i))
                } catch (e: RemoteException) {
                }
            }
        } finally {
            callbacks.finishBroadcast()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopClash()
                return START_NOT_STICKY
            }
        }
        // Read AC settings + active profile dir from Intent extras (provided by the
        // main process in start()). Falls back to SharedPreferences only when intent
        // is null (OS restart after OOM kill), in which case the :vpn process is fresh
        // and reads the correct values from disk.
        if (intent != null && intent.hasExtra(EXTRA_AC_ENABLED)) {
            acEnabled = intent.getBooleanExtra(EXTRA_AC_ENABLED, false)
            acForceIncluded = intent.getStringArrayExtra(EXTRA_AC_FORCE_INCLUDED)?.toSet() ?: emptySet()
            acForceExcluded = intent.getStringArrayExtra(EXTRA_AC_FORCE_EXCLUDED)?.toSet() ?: emptySet()
        } else {
            val ctx = this
            acEnabled = ConfigManager.isAccessControlEnabled(ctx)
            acForceIncluded = if (acEnabled) ConfigManager.getUserForceIncluded(ctx) else emptySet()
            acForceExcluded = if (acEnabled) ConfigManager.getUserForceExcluded(ctx) else emptySet()
        }
        intent?.getStringExtra(EXTRA_ACTIVE_DIR)?.takeIf { it.isNotBlank() }?.let {
            activeConfigDir = File(it)
        }
        startForegroundCompat()
        startClash()
        return START_STICKY
    }

    private fun startClash() {
        if (startJob?.isActive == true) return
        startJob = scope.launch {
            var fd = -1
            var fdOwned = true
            try {
                ClashState.setError(null)
                ClashState.setPhase(ConnectionPhase.LOADING)
                filesDir.resolve("clash").apply { mkdirs() } // core HOME (shared static)
                activeConfigDir.mkdirs()
                ensureConfigLoaded()

                // Apply user-saved proxies
                val currentGroups = Clash.queryGroupNames(false).toSet()
                ConfigManager.getSavedSelections(this@ClashVpnService).forEach { (group, proxy) ->
                    if (group !in currentGroups) return@forEach
                    runCatching {
                        if (!Clash.patchSelector(group, proxy)) {
                            // If the proxy is no longer in the config, remember the one Clash chose (first in the list)
                            Clash.queryGroup(group)?.now?.let { fallback ->
                                ConfigManager.saveSelectedProxy(this@ClashVpnService, group, fallback)
                            }
                        }
                    }
                }

                val ctx = this@ClashVpnService
                val tunAddress = randomTunAddress()
                val tunGateway = tunAddress
                val tunPortal = neighborAddress(tunAddress)
                val dnsServer = VPN_DNS
                val stack = ConfigManager.readTunStack(activeConfigDir) ?: "gvisor"
                val base = ConfigManager.readExcludePackages(activeConfigDir).toMutableSet()
                val excludePackages = if (acEnabled) {
                    (base - acForceIncluded + acForceExcluded).toList()
                } else {
                    base.toList()
                }

                val builder = Builder()
                    .setSession(getString(R.string.app_name))
                    .setMtu(VPN_MTU)
                    .addAddress(tunAddress, 30)
                    .addAddress(VPN_ADDRESS_V6, 64)
                    .addRoute("0.0.0.0", 0)
//                    .addRoute("192.168.0.0", 16) // SpyWare detection risk
//                    .addRoute("10.0.0.0", 8)
//                    .addRoute("172.16.0.0", 12)
//                    .addRoute("172.0.0.0", 12)
                    .addRoute("::", 0)
                    .addDnsServer(dnsServer)
                    .setBlocking(false)
//                    .addDisallowedApplication(packageName) // Exclude ourselves (bad for strict DPI)

                excludePackages.forEach { pkg ->
                    runCatching { builder.addDisallowedApplication(pkg) }
                        .onFailure { Log.w(TAG, "exclude-package not installed, skipped: $pkg") }
                }

                ClashState.setPhase(ConnectionPhase.ESTABLISHING)
                val pfd = builder.establish() ?: error("VpnService.establish() returned null")
                fd = pfd.detachFd()

                // Update state BEFORE starting blocking nativeStartTun
                ClashState.setPhase(ConnectionPhase.STARTING)
                ClashState.setTunAddress(tunAddress)
                ClashState.setLocalIp(com.cheezy.freedom.util.NetworkUtils.getLocalIpAddress())
                ClashState.setRunning(true)
                ClashState.setPhase(ConnectionPhase.CONNECTED)
                updateTile()
                ClashState.setError(null)
                startTrafficPolling()

                Log.i(TAG, "Clash starting (stack=$stack, tun=$tunAddress, dns=$dnsServer, exclude=${excludePackages.size})")

                Clash.startTun(
                    fd = fd,
                    stack = stack,
                    gateway = "$tunGateway/30",
                    portal = tunPortal,
                    dns = dnsServer,
                    markSocket = { sock -> protect(sock) },
                    querySocketUid = { _, _, _ -> 0 },
                )
                fdOwned = false
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to start Clash", t)
                if (fdOwned && fd >= 0) {
                    runCatching {
                        val jfd = java.io.FileDescriptor()
                        val setInt = java.io.FileDescriptor::class.java
                            .getDeclaredMethod("setInt$", Int::class.javaPrimitiveType)
                        setInt.isAccessible = true
                        setInt.invoke(jfd, fd)
                        android.system.Os.close(jfd)
                    }
                }
                ClashState.setError(t.message ?: t.javaClass.simpleName)
                stopClash()
                ClashState.setPhase(ConnectionPhase.ERROR)
            }
        }
    }

    private fun stopClash() {
        trafficJob?.cancel()
        trafficJob = null
        startJob?.cancel()
        startJob = null
        kotlinx.coroutines.runBlocking {
            runCatching { Clash.stopTun() }
            runCatching { Clash.stopHttp() }
            runCatching { com.github.kr328.clash.core.bridge.Bridge.nativeReset() }
        }
        ClashState.setRunning(false)
        ClashState.setPhase(ConnectionPhase.IDLE)
        ClashState.setTunAddress(null)
        ClashState.setLocalIp(null)
        ClashState.setActiveProxy(null)
        updateTile()
        runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
        stopSelf()
    }

    private fun updateTile() {
        runCatching {
            val component = ComponentName(this, VpnTileService::class.java)
            TileService.requestListeningState(this, component)
        }
    }

    private fun randomTunAddress(): String {
        // 10.x.y.z/30, x∈[8..255], y∈[0..255], z∈{1,5,9,...} — aligned to /30, odd → portal=z+1
        val rng = java.security.SecureRandom()
        val x = rng.nextInt(248) + 8
        val y = rng.nextInt(256)
        val zBase = rng.nextInt(63) * 4 + 1
        return "10.$x.$y.$zBase"
    }

    private fun neighborAddress(addr: String): String {
        val parts = addr.split('.').map { it.toInt() }.toMutableList()
        parts[3] = parts[3] + 1
        return parts.joinToString(".")
    }

    /** Returns the base address for addDnsServer from CIDR fake-ip-range like "198.18.0.1/16". */
    private fun fakeIpAnchor(cidr: String): String {
        return cidr.substringBefore('/').trim().ifBlank { "198.18.0.1" }
    }

    private fun startTrafficPolling() {
        trafficJob?.cancel()
        trafficJob = scope.launch {
            val nm = getSystemService(NotificationManager::class.java)
            var tick = 0
            var lastProxy: String? = null
            while (isActive) {
                val now = runCatching { Clash.queryTrafficNowBytes() }.getOrDefault(0L)
                ClashState.setTraffic(now)

                if (tick % 2 == 0) {
                    val proxy = runCatching {
                        val first = Clash.queryGroupNames(true).firstOrNull()
                        first?.let { Clash.queryGroup(it)?.now }
                    }.getOrNull()
                    if (proxy != lastProxy) {
                        lastProxy = proxy
                        ClashState.setActiveProxy(proxy)
                        nm.notify(NOTIFICATION_ID, buildNotification(proxy))
                    }
                }
                tick++
                delay(1_000)
            }
        }
    }

    override fun onRevoke() {
        stopClash()
    }

    override fun onDestroy() {
        stopClash()
        scope.cancel()
        super.onDestroy()
    }

    private fun startForegroundCompat() {
        val notification = buildNotification(null)
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(activeProxy: String?): Notification {
        val openMain = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, ClashVpnService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = activeProxy?.let { getString(R.string.notif_active_rule, it) }
            ?: getString(R.string.notif_vpn_active)
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_tile)
            .setContentIntent(openMain)
            .addAction(0, getString(R.string.notif_stop), stopIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun ensureChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "VPN", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    companion object {
        private const val TAG = "ClashVpnService"
        private const val CHANNEL_ID = "cheezy.vpn"
        private const val NOTIFICATION_ID = 7

        const val ACTION_STOP = "com.cheezy.freedom.action.STOP"

        private const val VPN_MTU = 9000
        private const val VPN_ADDRESS_V6 = "fdfe:dcba:9876::1"
        private const val VPN_DNS = "1.1.1.1"

        private const val EXTRA_AC_ENABLED = "extra.ac_enabled"
        private const val EXTRA_AC_FORCE_INCLUDED = "extra.ac_force_included"
        private const val EXTRA_AC_FORCE_EXCLUDED = "extra.ac_force_excluded"
        private const val EXTRA_ACTIVE_DIR = "extra.active_dir"

        fun start(context: Context) {
            // Read AC settings + active profile dir in the calling (main) process — its
            // SharedPreferences cache is always up-to-date. The :vpn process has a separate
            // cache that may be stale.
            val acEnabled = ConfigManager.isAccessControlEnabled(context)
            val forceIncluded = if (acEnabled) ConfigManager.getUserForceIncluded(context) else emptySet()
            val forceExcluded = if (acEnabled) ConfigManager.getUserForceExcluded(context) else emptySet()

            val intent = Intent(context, ClashVpnService::class.java).apply {
                putExtra(EXTRA_AC_ENABLED, acEnabled)
                putExtra(EXTRA_AC_FORCE_INCLUDED, forceIncluded.toTypedArray())
                putExtra(EXTRA_AC_FORCE_EXCLUDED, forceExcluded.toTypedArray())
                putExtra(EXTRA_ACTIVE_DIR, ProfileStore.activeDir(context).absolutePath)
            }
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, ClashVpnService::class.java).setAction(ACTION_STOP)
            )
        }
    }
}
