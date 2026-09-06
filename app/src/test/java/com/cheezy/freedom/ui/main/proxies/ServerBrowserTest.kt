package com.cheezy.freedom.ui.main.proxies

import org.junit.Assert.*
import org.junit.Test

class ServerBrowserTest {
    private val proxies = listOf("B", "a", "C").map { ProxyUiData(it, "direct", "", "B") }
    @Test fun `search ignores case and latency sorts failed checks last`() {
        assertEquals(listOf("a"), browseServers(proxies, " A ", ServerSort.PROFILE, emptyMap()).map { it.name })
        assertEquals(listOf("a", "B", "C"), browseServers(proxies, "", ServerSort.NAME, emptyMap()).map { it.name })
        assertEquals(listOf("B", "a", "C"), browseServers(proxies, "", ServerSort.LATENCY, mapOf("B" to 20, "a" to 0, "C" to 65535)).map { it.name })
        assertEquals(proxies, browseServers(proxies, "", ServerSort.PROFILE, emptyMap()))
    }
}
