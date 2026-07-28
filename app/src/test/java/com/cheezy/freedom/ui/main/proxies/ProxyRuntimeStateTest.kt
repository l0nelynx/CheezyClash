package com.cheezy.freedom.ui.main.proxies

import com.github.kr328.clash.core.model.Proxy
import com.github.kr328.clash.core.model.ProxyGroup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProxyRuntimeStateTest {
    @Test
    fun `first selector skips automatic groups`() {
        val snapshot = buildProxyRuntimeSnapshot(
            groupNames = listOf("AUTO", "PROXY", "SECOND"),
            groupMap = mapOf(
                "AUTO" to ProxyGroup(type = Proxy.Type.URLTest, now = "A"),
                "PROXY" to ProxyGroup(
                    type = Proxy.Type.Selector,
                    now = "B",
                    proxies = listOf(Proxy(name = "B")),
                ),
                "SECOND" to ProxyGroup(type = Proxy.Type.Selector, now = "C"),
            ),
        )

        assertEquals("PROXY", snapshot.primarySelector?.name)
        assertEquals("B", snapshot.primarySelector?.now)
    }

    @Test
    fun `delay maps stay scoped to their group`() {
        val snapshot = buildProxyRuntimeSnapshot(
            groupNames = listOf("ONE", "TWO"),
            groupMap = mapOf(
                "ONE" to ProxyGroup(
                    type = Proxy.Type.Selector,
                    proxies = listOf(
                        Proxy(name = "same", delay = 120, delayAvailable = true),
                    ),
                ),
                "TWO" to ProxyGroup(
                    type = Proxy.Type.Selector,
                    proxies = listOf(
                        Proxy(name = "same", delay = 420, delayAvailable = true),
                    ),
                ),
            ),
        )

        assertEquals(120, snapshot.delays["ONE"]?.get("same"))
        assertEquals(420, snapshot.delays["TWO"]?.get("same"))
    }

    @Test
    fun `unknown delay is omitted and failed check is timeout`() {
        val snapshot = buildProxyRuntimeSnapshot(
            groupNames = listOf("PROXY"),
            groupMap = mapOf(
                "PROXY" to ProxyGroup(
                    type = Proxy.Type.Selector,
                    proxies = listOf(
                        Proxy(name = "unknown", delay = 65535, delayAvailable = false),
                        Proxy(name = "failed", delay = 65535, delayAvailable = true),
                    ),
                ),
            ),
        )

        assertNull(snapshot.delays["PROXY"]?.get("unknown"))
        assertEquals(-1, snapshot.delays["PROXY"]?.get("failed"))
    }

    @Test
    fun `nested group uses active child delay`() {
        val nested = ProxyUiData(
            name = "AUTO",
            type = "URLTest",
            subtitle = "URLTest",
            groupNow = "AUTO",
            activeChild = "node-a",
        )
        val delays = mapOf(
            "PROXY" to mapOf("AUTO" to 500),
            "AUTO" to mapOf("node-a" to 88),
        )

        assertEquals(88, proxyDelay("PROXY", nested, delays))
    }

    @Test
    fun `failed group keeps its previous delays while successful group is replaced`() {
        val previous = mapOf(
            "FAILED" to mapOf("old" to 90),
            "OK" to mapOf("stale" to 180),
            "REMOVED" to mapOf("gone" to 270),
        )
        val snapshot = ProxyRuntimeSnapshot(
            requestedNames = listOf("FAILED", "OK"),
            groups = emptyList(),
            primarySelector = null,
            delays = mapOf("OK" to mapOf("fresh" to 75)),
        )

        assertEquals(
            mapOf(
                "FAILED" to mapOf("old" to 90),
                "OK" to mapOf("fresh" to 75),
            ),
            mergeProxyDelays(previous, snapshot, replaceGroups = false),
        )
    }

    @Test
    fun `profile replacement drops delays from previous runtime`() {
        val previous = mapOf("OLD" to mapOf("node" to 90))
        val snapshot = ProxyRuntimeSnapshot(
            requestedNames = listOf("NEW"),
            groups = emptyList(),
            primarySelector = null,
            delays = mapOf("NEW" to mapOf("node" to 120)),
        )

        assertEquals(
            mapOf("NEW" to mapOf("node" to 120)),
            mergeProxyDelays(previous, snapshot, replaceGroups = true),
        )
    }
}
