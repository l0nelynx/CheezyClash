package com.cheezy.freedom.clash

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.github.kr328.clash.core.model.LogMessage
import com.github.kr328.clash.core.model.ProxyGroup
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

object ClashRemoteManager {
    private const val TAG = "ClashRemote"
    private var service: IClashInterface? = null
    private lateinit var appContext: Context
    private var bound = false
    
    private val json = Json { ignoreUnknownKeys = true }

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    private val callback = object : IClashCallback.Stub() {
        override fun onStateChanged(running: Boolean, lastError: String?) {
            ClashState.setRunning(running)
            ClashState.setError(lastError)
        }

        override fun onPhaseChanged(phase: Int) {
            val value = ConnectionPhase.entries.getOrElse(phase) { ConnectionPhase.IDLE }
            ClashState.setPhase(value)
        }

        override fun onTrafficUpdated(bytesPerSecond: Long) {
            ClashState.setTraffic(bytesPerSecond)
        }

        override fun onActiveProxyChanged(proxy: String?) {
            ClashState.setActiveProxy(proxy)
        }

        override fun onIpAddressesUpdated(tunAddr: String?, localAddr: String?) {
            ClashState.setTunAddress(tunAddr)
            ClashState.setLocalIp(localAddr)
        }
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            Log.d(TAG, "Service connected")
            val remote = IClashInterface.Stub.asInterface(binder)
            service = remote
            val registered = runCatching {
                remote.registerCallback(callback)
                true
            }.onFailure { Log.w(TAG, "Failed to register service callback", it) }
                .getOrDefault(false)
            _connected.value = registered
            if (!registered) service = null
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            com.cheezy.freedom.diagnostics.CrashReporting.serviceDisconnected(appContext)
            Log.d(TAG, "Service disconnected")
            service = null
            _connected.value = false
        }

        override fun onBindingDied(name: ComponentName?) {
            com.cheezy.freedom.diagnostics.CrashReporting.serviceDisconnected(appContext)
            Log.w(TAG, "Service binding died")
            service = null
            _connected.value = false
            synchronized(this@ClashRemoteManager) {
                if (bound) runCatching { appContext.unbindService(this) }
                bound = false
            }
            if (ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                bind()
            }
        }

        override fun onNullBinding(name: ComponentName?) {
            Log.e(TAG, "Service returned a null binding")
            service = null
            _connected.value = false
            synchronized(this@ClashRemoteManager) {
                if (bound) runCatching { appContext.unbindService(this) }
                bound = false
            }
        }
    }

    private val processObserver = object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) = bind()
        override fun onStop(owner: LifecycleOwner) = unbind()
    }

    fun init(context: Context) {
        appContext = context.applicationContext
        ProcessLifecycleOwner.get().lifecycle.addObserver(processObserver)
        if (ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            bind()
        }
    }

    @Synchronized
    private fun bind() {
        if (bound) return
        val intent = Intent(appContext, ClashVpnService::class.java).apply {
            action = "com.cheezy.freedom.clash.IClashInterface"
        }
        bound = appContext.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        if (!bound) Log.e(TAG, "Failed to bind VPN service")
    }

    @Synchronized
    private fun unbind() {
        if (!bound) return
        runCatching { service?.unregisterCallback(callback) }
        runCatching { appContext.unbindService(connection) }
        service = null
        bound = false
        _connected.value = false
    }

    fun subscribeLogcat(): Flow<LogMessage> = callbackFlow {
        val logCallback = object : ILogcatCallback.Stub() {
            override fun onLogReceived(jsonPayload: String) {
                runCatching {
                    trySend(json.decodeFromString(LogMessage.serializer(), jsonPayload))
                }
            }
        }
        var registeredService: IClashInterface? = null
        launch {
            connected.collectLatest { isConnected ->
                if (isConnected) {
                    val current = service
                    if (current != null && current !== registeredService) {
                        runCatching { current.subscribeLogcat(logCallback) }
                        registeredService = current
                    }
                } else {
                    registeredService = null
                }
            }
        }
        awaitClose {
            runCatching { registeredService?.unsubscribeLogcat(logCallback) }
        }
    }

    suspend fun queryGroupNames(exclude: Boolean): List<String> = withContext(Dispatchers.IO) {
        val raw = runCatching { service?.queryGroupNames(exclude) }.getOrNull() ?: return@withContext emptyList()
        runCatching {
            json.decodeFromString(ListSerializer(String.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    suspend fun queryGroup(name: String, sort: String = "Default"): ProxyGroup? = withContext(Dispatchers.IO) {
        val raw = runCatching { service?.queryGroup(name, sort) }.getOrNull() ?: return@withContext null
        runCatching {
            json.decodeFromString(ProxyGroup.serializer(), raw)
        }.getOrNull()
    }

    suspend fun patchSelector(group: String, name: String): Boolean = withContext(Dispatchers.IO) {
        val ok = runCatching { service?.patchSelector(group, name) ?: false }.getOrDefault(false)
        if (ok) {
            // Persist in the main process only — :vpn must not write SharedPreferences.
            ConfigManager.saveSelectedProxy(appContext, group, name)
        }
        ok
    }

    fun refreshCrashReportingPolicy() { runCatching { service?.refreshCrashReportingPolicy() } }

    suspend fun healthCheckAll(): Boolean = withContext(Dispatchers.IO) {
        runCatching { service?.healthCheckAll() ?: false }.getOrDefault(false)
    }

    suspend fun healthCheckGroup(name: String): Boolean = withContext(Dispatchers.IO) {
        runCatching { service?.healthCheckGroup(name) ?: false }.getOrDefault(false)
    }

    suspend fun healthCheckProxy(group: String, proxy: String): Boolean = withContext(Dispatchers.IO) {
        runCatching { service?.healthCheckProxy(group, proxy) ?: false }.getOrDefault(false)
    }

    suspend fun isRunning(): Boolean = withContext(Dispatchers.IO) {
        runCatching { service?.isRunning ?: false }.getOrDefault(false)
    }

    suspend fun stopVpn() = withContext(Dispatchers.IO) {
        runCatching { service?.stopVpn() }
    }

    suspend fun loadConfigChecked(path: String) = withContext(Dispatchers.IO) {
        checkNotNull(service) { "VPN service is not connected" }.loadConfig(path)
    }

    suspend fun loadConfig(path: String) = withContext(Dispatchers.IO) {
        runCatching { service?.loadConfig(path) }
    }
}
