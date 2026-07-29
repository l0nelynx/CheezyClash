package com.cheezy.freedom.clash

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.Closeable
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL
import java.net.URLConnection
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class WapNetworkSession internal constructor(
    private val connectivityManager: ConnectivityManager,
    private val callback: ConnectivityManager.NetworkCallback,
    val network: Network,
    val proxy: ResolvedWapProxy,
) : Closeable {
    private val closed = AtomicBoolean(false)

    fun openConnection(url: URL): URLConnection = network.openConnection(
        url,
        Proxy(Proxy.Type.HTTP, InetSocketAddress.createUnresolved(proxy.host, proxy.port)),
    )

    fun bindAndProtect(fd: Int, protect: (Int) -> Boolean): Boolean = runCatching {
        ParcelFileDescriptor.fromFd(fd).use { duplicate ->
            network.bindSocket(duplicate.fileDescriptor)
        }
        protect(fd)
    }.getOrDefault(false)

    override fun close() {
        if (closed.compareAndSet(false, true)) {
            runCatching { connectivityManager.unregisterNetworkCallback(callback) }
        }
    }
}

object WapNetworkManager {
    private const val REQUEST_TIMEOUT_MS = 15_000

    suspend fun acquire(
        context: Context,
        settings: WapSettings,
        onLost: (Network) -> Unit = {},
        onProxyChanged: (ResolvedWapProxy) -> Unit = {},
    ): WapNetworkSession {
        require(settings.enabled) { "WAP mode is disabled" }
        val cm = context.getSystemService(ConnectivityManager::class.java)
            ?: throw IOException("ConnectivityManager unavailable")
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build()

        return suspendCancellableCoroutine { continuation ->
            val completed = AtomicBoolean(false)
            var activeSession: WapNetworkSession? = null
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    val proxy = resolveProxy(cm.getLinkProperties(network), settings)
                    val session = WapNetworkSession(cm, this, network, proxy)
                    if (completed.compareAndSet(false, true)) {
                        activeSession = session
                        continuation.resume(session)
                    }
                }

                override fun onUnavailable() {
                    if (completed.compareAndSet(false, true)) {
                        continuation.resumeWithException(IOException("Cellular network unavailable"))
                    }
                }

                override fun onLost(network: Network) {
                    val session = activeSession ?: return
                    if (session.network == network) onLost(network)
                }

                override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) {
                    val session = activeSession ?: return
                    if (session.network != network || settings.mode != WapMode.AUTO) return
                    val resolved = resolveProxy(linkProperties, settings)
                    if (resolved != session.proxy) onProxyChanged(resolved)
                }
            }
            continuation.invokeOnCancellation {
                if (!completed.get()) runCatching { cm.unregisterNetworkCallback(callback) }
                activeSession?.close()
            }
            runCatching { cm.requestNetwork(request, callback, REQUEST_TIMEOUT_MS) }
                .onFailure {
                    if (completed.compareAndSet(false, true)) continuation.resumeWithException(it)
                }
        }
    }

    internal fun resolveProxy(linkProperties: LinkProperties?, settings: WapSettings): ResolvedWapProxy {
        if (settings.mode == WapMode.MANUAL) return WapSettingsStore.fallbackProxy(settings)
        val apnProxy = linkProperties?.httpProxy
        val host = apnProxy?.host?.trim().orEmpty()
        val port = apnProxy?.port ?: -1
        return if (host.isNotBlank() && port in 1..65535) {
            ResolvedWapProxy(host, port, settings.username, settings.password)
        } else {
            WapSettingsStore.fallbackProxy(settings)
        }
    }
}
