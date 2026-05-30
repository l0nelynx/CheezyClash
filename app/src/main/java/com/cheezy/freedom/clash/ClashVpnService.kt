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

class ClashVpnService : VpnService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var startJob: Job? = null
    private var trafficJob: Job? = null
    private var logJob: Job? = null

    private val callbacks = RemoteCallbackList<IClashCallback>()
    private val logCallbacks = RemoteCallbackList<ILogcatCallback>()

    private val binder = object : IClashInterface.Stub() {
        override fun registerCallback(callback: IClashCallback) {
            callbacks.register(callback)
            // Immediately send current state to the new subscriber
            try {
                callback.onStateChanged(ClashState.running.value, ClashState.lastError.value)
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
            Clash.load(java.io.File(path))
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
        ensureChannel()
        
        // Forward ClashState changes (in this process) to all remote callbacks
        scope.launch {
            ClashState.running.collect { r ->
                val err = ClashState.lastError.value
                broadcast { it.onStateChanged(r, err) }
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
                val home = filesDir.resolve("clash").apply { mkdirs() }
                Clash.load(home)

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
                val stack = ConfigManager.readTunStack(ctx) ?: "gvisor"
                val excludePackages = ConfigManager.readExcludePackages(ctx)

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

                val pfd = builder.establish() ?: error("VpnService.establish() returned null")
                fd = pfd.detachFd()

                // Update state BEFORE starting blocking nativeStartTun
                ClashState.setTunAddress(tunAddress)
                ClashState.setLocalIp(com.cheezy.freedom.util.NetworkUtils.getLocalIpAddress())
                ClashState.setRunning(true)
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
        val text = activeProxy?.let { "Активное правило: $it" } ?: "VPN активен"
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openMain)
            .addAction(0, "Stop", stopIntent)
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

        fun start(context: Context) {
            val intent = Intent(context, ClashVpnService::class.java)
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
