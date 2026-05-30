package com.github.kr328.clash.core

import com.github.kr328.clash.core.bridge.Bridge
import com.github.kr328.clash.core.bridge.LogcatInterface
import com.github.kr328.clash.core.bridge.TunInterface
import com.github.kr328.clash.core.model.LogMessage
import com.github.kr328.clash.core.model.Proxy
import com.github.kr328.clash.core.model.ProxyGroup
import com.github.kr328.clash.core.model.ProxySort
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.io.File
import java.net.InetSocketAddress

object Clash {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Сериализуем только операции, меняющие конфиг/состояние ядра — load и patchSelector.
     *
     * Гонка load↔patchSelector реальна: bootstrap()/refresh() в MainViewModel и onStartCommand()
     * в ClashVpnService могут одновременно дёрнуть load, пока другой поток уже патчит селектор
     * по сохраненному выбору пользователя — native-сторона на такое отвечает invalid memory access.
     *
     * Сюда НЕЛЬЗЯ заводить:
     *  - startTun — он блокирующий (держит вызов всё время tun loop), залочит mutex навсегда
     *    и подвесит startTrafficPolling/queryGroup из UI.
     *  - query*healthCheck* — потокобезопасны на native-стороне и часто вызываются параллельно
     *    с активным tun loop, сериализация съест отзывчивость UI.
     */
    private val configMutex = Mutex()

    suspend fun load(path: File) = configMutex.withLock {
        val deferred = CompletableDeferred<Unit>()
        Bridge.nativeLoad(deferred, path.absolutePath)
        deferred.await()
    }

    suspend fun startTun(
        fd: Int,
        stack: String,
        gateway: String,
        portal: String,
        dns: String,
        markSocket: (Int) -> Boolean,
        querySocketUid: (protocol: Int, source: InetSocketAddress, target: InetSocketAddress) -> Int,
    ) {
        Bridge.nativeStartTun(fd, stack, gateway, portal, dns, object : TunInterface {
            override fun markSocket(fd: Int) {
                markSocket(fd)
            }

            override fun querySocketUid(protocol: Int, source: String, target: String): Int {
                return querySocketUid(
                    protocol,
                    parseInetSocketAddress(source),
                    parseInetSocketAddress(target),
                )
            }
        })
    }

    suspend fun stopTun() {
        Bridge.nativeStopTun()
    }

    suspend fun stopHttp() {
        Bridge.nativeStopHttp()
    }

    suspend fun suspendCore(suspended: Boolean) {
        Bridge.nativeSuspend(suspended)
    }

    fun coreVersion(): String = Bridge.nativeCoreVersion()

    /**
     * Версия mihomo, с которой собрана libclash.so. Возвращает pseudo-version
     * или тег из go.mod (например, "v0.0.0-20260526130344-4065583ae462"),
     * либо "unknown" если ldflags не были применены при сборке.
     */
    fun mihomoVersion(): String = Bridge.nativeMihomoVersion()

    suspend fun queryTrafficNow(): Long {
        return Bridge.nativeQueryTrafficNow()
    }

    suspend fun queryTrafficTotal(): Long {
        return Bridge.nativeQueryTrafficTotal()
    }

    suspend fun queryTrafficNowBytes(): Long {
        val raw = queryTrafficNow()
        return com.github.kr328.clash.core.util.trafficTotalBytes(raw)
    }

    suspend fun queryGroupNames(excludeNotSelectable: Boolean = true): List<String> {
        val raw = Bridge.nativeQueryGroupNames(excludeNotSelectable)
        return runCatching {
            json.decodeFromString(ListSerializer(String.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    suspend fun queryGroup(name: String, sort: ProxySort = ProxySort.Default): ProxyGroup? {
        val raw = Bridge.nativeQueryGroup(name, sort.name) ?: return null
        return runCatching {
            json.decodeFromString(ProxyGroup.serializer(), raw)
        }.getOrNull()
    }

    suspend fun patchSelector(group: String, name: String): Boolean = configMutex.withLock {
        return@withLock Bridge.nativePatchSelector(group, name)
    }

    suspend fun healthCheckAll() {
        Bridge.nativeHealthCheckAll()
    }

    suspend fun healthCheck(name: String) {
        val deferred = CompletableDeferred<Unit>()
        Bridge.nativeHealthCheck(deferred, name)
        deferred.await()
    }

    fun subscribeLogcat(): ReceiveChannel<LogMessage> {
        val channel = Channel<LogMessage>(Channel.BUFFERED)
        Bridge.nativeSubscribeLogcat(object : LogcatInterface {
            override fun received(jsonPayload: String) {
                runCatching {
                    channel.trySend(json.decodeFromString(LogMessage.serializer(), jsonPayload))
                }
            }
        })
        return channel
    }

    @Suppress("unused")
    private fun typeIsGroup(t: Proxy.Type) = t.group

    private fun parseInetSocketAddress(s: String): InetSocketAddress {
        val idx = s.lastIndexOf(':')
        if (idx <= 0) return InetSocketAddress(0)
        val host = s.substring(0, idx).trim('[', ']')
        val port = s.substring(idx + 1).toIntOrNull() ?: 0
        return InetSocketAddress.createUnresolved(host, port)
    }
}
