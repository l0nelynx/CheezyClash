package com.cheezy.freedom.clash

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.yaml.snakeyaml.Yaml

class XrayMuxConfigOverrideTest {
    @Suppress("UNCHECKED_CAST")
    private fun config(source: String): MutableMap<String, Any?> =
        Yaml().load<Map<String, Any?>>(source).toMutableMap()

    @Suppress("UNCHECKED_CAST")
    private fun proxy(yaml: Map<String, Any?>, index: Int): Map<String, Any?> =
        (yaml["proxies"] as List<Map<String, Any?>>)[index]

    @Test
    fun `injects enabled mux into eligible inline vless`() {
        val yaml = config(
            """
            proxies:
              - { name: plain, type: vless, server: example.com, flow: " " }
              - { name: vision, type: vless, server: example.com, flow: xtls-rprx-vision }
              - { name: vmess, type: vmess, server: example.com }
            """.trimIndent(),
        )

        XrayMuxConfigOverride.apply(yaml, XrayMuxSettings(enabled = true, concurrency = 32))

        assertEquals(
            mapOf("enabled" to true, "concurrency" to 32),
            proxy(yaml, 0)["xray-mux"],
        )
        assertNull(proxy(yaml, 1)["xray-mux"])
        assertNull(proxy(yaml, 2)["xray-mux"])
    }

    @Test
    fun `positive max connections is injected and zero is omitted`() {
        val yaml = config("proxies: [{ name: node, type: vless }]")
        XrayMuxConfigOverride.apply(yaml, XrayMuxSettings(maxConnections = 3))
        @Suppress("UNCHECKED_CAST")
        val mux = proxy(yaml, 0)["xray-mux"] as Map<String, Any?>
        assertEquals(3, mux["max-connections"])

        val unlimited = config("proxies: [{ name: node, type: vless }]")
        XrayMuxConfigOverride.apply(unlimited, XrayMuxSettings(maxConnections = 0))
        @Suppress("UNCHECKED_CAST")
        val unlimitedMux = proxy(unlimited, 0)["xray-mux"] as Map<String, Any?>
        assertFalse(unlimitedMux.containsKey("max-connections"))
    }

    @Test
    fun `does not inject mux into non raw tcp vless transports`() {
        val yaml = config(
            """
            proxies:
              - { name: implicit-tcp, type: vless }
              - { name: explicit-tcp, type: vless, network: TCP }
              - { name: xhttp, type: vless, network: xhttp }
              - { name: grpc, type: vless, network: grpc }
              - { name: ws, type: vless, network: ws }
              - { name: hysteria, type: vless, network: hysteria }
            """.trimIndent(),
        )

        XrayMuxConfigOverride.apply(yaml, XrayMuxSettings())

        assertEquals(mapOf("enabled" to true, "concurrency" to 32), proxy(yaml, 0)["xray-mux"])
        assertEquals(mapOf("enabled" to true, "concurrency" to 32), proxy(yaml, 1)["xray-mux"])
        for (index in 2..5) assertNull(proxy(yaml, index)["xray-mux"])
    }

    @Test
    fun `disabled setting forcibly replaces subscription and provider values`() {
        val yaml = config(
            """
            proxies:
              - name: node
                type: vless
                xray-mux: { enabled: true, concurrency: 99, max-connections: 7 }
            proxy-providers:
              remote:
                type: http
                url: https://example.com/sub
                override:
                  udp: true
                  xray-mux: { enabled: true, concurrency: 64 }
            """.trimIndent(),
        )

        XrayMuxConfigOverride.apply(yaml, XrayMuxSettings(enabled = false))

        assertEquals(mapOf("enabled" to false), proxy(yaml, 0)["xray-mux"])
        @Suppress("UNCHECKED_CAST")
        val providers = yaml["proxy-providers"] as Map<String, Map<String, Any?>>
        @Suppress("UNCHECKED_CAST")
        val override = providers.getValue("remote")["override"] as Map<String, Any?>
        assertEquals(true, override["udp"])
        assertEquals(mapOf("enabled" to false), override["xray-mux"])
    }
}
