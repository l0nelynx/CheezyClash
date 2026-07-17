package com.cheezy.freedom.clash

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalProxyOverrideTest {

    @Test
    fun `apply sets all four top-level keys with expected values`() {
        val map: MutableMap<String, Any?> = mutableMapOf(
            "proxies" to listOf<Any>(),
            "mixed-port" to 7890,
            "allow-lan" to false,
        )

        LocalProxyOverride.authEntry = "cheezy:testpass"
        LocalProxyOverride.apply(map)

        assertEquals(2080, map["mixed-port"])
        @Suppress("UNCHECKED_CAST")
        val auth = map["authentication"] as List<String>
        assertEquals(1, auth.size)
        assertTrue(auth[0].startsWith("cheezy:"))
        assertEquals(
            listOf(
                "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12",
                "192.168.0.0/16", "::1/128", "fc00::/7",
            ),
            map["lan-allowed-ips"],
        )
        assertEquals(true, map["allow-lan"])
        assertTrue("apply must preserve unrelated keys", map.containsKey("proxies"))
    }

    @Test
    fun `isForcedByBase returns true when allow-lan is true`() {
        assertTrue(LocalProxyOverride.isForcedByBase(mapOf("allow-lan" to true)))
    }

    @Test
    fun `isForcedByBase returns false when allow-lan is false`() {
        assertFalse(LocalProxyOverride.isForcedByBase(mapOf("allow-lan" to false)))
    }

    @Test
    fun `isForcedByBase returns false when allow-lan is missing`() {
        assertFalse(LocalProxyOverride.isForcedByBase(emptyMap()))
    }

    @Test
    fun `isForcedByBase returns false when allow-lan is non-boolean truthy string`() {
        // YAML parsers may emit booleans only; a "true" string should not force the state.
        assertFalse(LocalProxyOverride.isForcedByBase(mapOf("allow-lan" to "true")))
    }
}
