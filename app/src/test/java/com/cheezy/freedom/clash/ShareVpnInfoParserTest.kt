package com.cheezy.freedom.clash

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShareVpnInfoParserTest {

    @Test
    fun `parses mixed-port`() {
        val ports = ConfigOverrideManager.parsePortsForTest("""
            mixed-port: 2080
            proxies: []
        """.trimIndent())
        assertEquals(2080, ports.mixedPort)
        assertNull(ports.httpPort)
        assertNull(ports.socksPort)
    }

    @Test
    fun `parses port and socks-port separately`() {
        val ports = ConfigOverrideManager.parsePortsForTest("""
            port: 7890
            socks-port: 7891
        """.trimIndent())
        assertNull(ports.mixedPort)
        assertEquals(7890, ports.httpPort)
        assertEquals(7891, ports.socksPort)
    }

    @Test
    fun `all null when no port keys present`() {
        val ports = ConfigOverrideManager.parsePortsForTest("""
            proxies: []
        """.trimIndent())
        assertNull(ports.mixedPort)
        assertNull(ports.httpPort)
        assertNull(ports.socksPort)
    }

    @Test
    fun `string ports are ignored`() {
        // Mihomo expects integers; if the YAML somehow contains a string, we
        // shouldn't crash and we shouldn't pretend we know the number.
        val ports = ConfigOverrideManager.parsePortsForTest("""
            mixed-port: "abc"
        """.trimIndent())
        assertNull(ports.mixedPort)
    }
}
