package com.cheezy.freedom.clash

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
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
            service = IClashInterface.Stub.asInterface(binder)
            runCatching { service?.registerCallback(callback) }
            _connected.value = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.d(TAG, "Service disconnected")
            service = null
            _connected.value = false
        }
    }

    fun init(context: Context) {
        val intent = Intent(context, ClashVpnService::class.java).apply {
            action = "com.cheezy.freedom.clash.IClashInterface"
        }
        context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    fun subscribeLogcat(): Flow<LogMessage> = callbackFlow {
        val logCallback = object : ILogcatCallback.Stub() {
            override fun onLogReceived(jsonPayload: String) {
                runCatching {
                    trySend(json.decodeFromString(LogMessage.serializer(), jsonPayload))
                }
            }
        }
        val s = service
        if (s != null) {
            runCatching { s.subscribeLogcat(logCallback) }
        }
        
        launch {
            connected.collect { isConnected ->
                if (isConnected) {
                    runCatching { service?.subscribeLogcat(logCallback) }
                }
            }
        }
        awaitClose { 
            // Unfortunately, RemoteCallbackList.unregister happens on the service
            // side automatically when the process dies, or we need an unsubscribe method.
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
        runCatching { service?.patchSelector(group, name) ?: false }.getOrDefault(false)
    }

    suspend fun healthCheck(name: String) = withContext(Dispatchers.IO) {
        runCatching { service?.healthCheck(name) }
    }

    suspend fun isRunning(): Boolean = withContext(Dispatchers.IO) {
        runCatching { service?.isRunning ?: false }.getOrDefault(false)
    }

    suspend fun stopVpn() = withContext(Dispatchers.IO) {
        runCatching { service?.stopVpn() }
    }

    suspend fun loadConfig(path: String) = withContext(Dispatchers.IO) {
        runCatching { service?.loadConfig(path) }
    }
}
