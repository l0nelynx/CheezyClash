package com.cheezy.freedom.clash

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.yaml.snakeyaml.Yaml
import kotlin.io.path.createTempDirectory

class WapConfigOverrideTest {
    @Test
    fun `wap override is TCP only and fail closed`() {
        val dir = createTempDirectory("wap-config-test").toFile()
        try {
            dir.resolve(ConfigOverrideManager.BASE_FILE_NAME).writeText(
                """
                proxies:
                  - { name: good, type: vless, server: good.example, port: 443, network: xhttp }
                  - { name: udp, type: wireguard, server: wg.example, port: 2408 }
                  - { name: bad-port, type: vless, server: bad.example, port: 80 }
                proxy-groups:
                  - name: select
                    type: select
                    proxies: [good, udp, bad-port, DIRECT]
                proxy-providers:
                  remote:
                    type: http
                    url: https://subscription.example/provider
                rule-providers:
                  rules:
                    type: http
                    url: https://rules.example/list
                dns:
                  enable: true
                  nameserver: [system://]
                rules:
                  - DOMAIN,example.com,DIRECT
                  - IP-CIDR,192.0.2.0/24,DIRECT,no-resolve
                  - MATCH,DIRECT
                """.trimIndent()
            )
            val runtime = WapRuntimeConfig(
                proxy = ResolvedWapProxy("192.168.192.192", 9201),
                subscriptionHost = "subscription.example",
                subscriptionHeaders = mapOf("x-hwid" to "test-device", "user-agent" to "mihomo/test"),
            )
            ConfigOverrideManager.rebuildInDir(dir, setOf(WapConfigOverride.id), runtime)

            @Suppress("UNCHECKED_CAST")
            val config = Yaml().load<Map<String, Any?>>(dir.resolve("config.yaml").readText())
            val proxies = config["proxies"] as List<Map<String, Any?>>
            assertEquals(listOf("good", WapConfigOverride.PROXY_NAME), proxies.map { it["name"] })
            assertEquals(WapConfigOverride.PROXY_NAME, proxies.first()["dialer-proxy"])
            assertEquals(false, proxies.first()["udp"])
            val upstream = proxies.last()
            assertEquals(7, upstream["max-connections"])
            assertEquals(listOf(443, 8443, 13324), upstream["allowed-connect-ports"])

            val groups = config["proxy-groups"] as List<Map<String, Any?>>
            assertEquals(listOf("good"), groups.first()["proxies"])
            val rules = config["rules"] as List<String>
            assertEquals("NETWORK,UDP,REJECT", rules.first())
            assertTrue(rules.contains("DOMAIN,example.com,REJECT"))
            assertTrue(rules.contains("IP-CIDR,192.0.2.0/24,REJECT,no-resolve"))
            assertEquals("MATCH,REJECT", rules.last())
            assertFalse(rules.any { it.endsWith(",DIRECT") })

            val providers = config["proxy-providers"] as Map<String, Map<String, Any?>>
            val provider = providers.getValue("remote")
            assertEquals(WapConfigOverride.PROXY_NAME, provider["proxy"])
            assertEquals("test-device", (provider["header"] as Map<*, *>)["x-hwid"])
            assertNotNull(provider["override"])
            val ruleProviders = config["rule-providers"] as Map<String, Map<String, Any?>>
            assertEquals(WapConfigOverride.PROXY_NAME, ruleProviders.getValue("rules")["proxy"])
            val dns = config["dns"] as Map<String, Any?>
            assertTrue((dns["nameserver"] as List<*>).all { it.toString().endsWith("#${WapConfigOverride.PROXY_NAME}") })
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun `device headers are not copied to cross origin provider`() {
        val yaml = linkedMapOf<String, Any?>(
            "proxy-providers" to linkedMapOf(
                "foreign" to linkedMapOf<String, Any?>(
                    "type" to "http",
                    "url" to "https://foreign.example/provider",
                )
            )
        )
        WapConfigOverride.runtime = WapRuntimeConfig(
            ResolvedWapProxy("192.168.192.192", 9201),
            "subscription.example",
            mapOf("x-hwid" to "must-not-leak"),
        )
        try {
            WapConfigOverride.apply(yaml)
        } finally {
            WapConfigOverride.runtime = null
        }
        @Suppress("UNCHECKED_CAST")
        val provider = ((yaml["proxy-providers"] as Map<String, Any?>)["foreign"] as Map<String, Any?>)
        assertFalse(provider.containsKey("header"))
    }
}
