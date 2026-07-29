package com.cheezy.freedom.clash

import java.net.URL

data class WapRuntimeConfig(
    val proxy: ResolvedWapProxy,
    val subscriptionHost: String? = null,
    val subscriptionHeaders: Map<String, String> = emptyMap(),
)

object WapConfigOverride : ConfigOverride {
    override val id: String = "wap-upstream"

    const val PROXY_NAME = "__CHEEZY_WAP_UPSTREAM__"
    const val CORE_CONNECTION_LIMIT = 7
    val ALLOWED_PORTS = setOf(443, 8443, 13324)

    private val tcpTypes = setOf(
        "http", "socks5", "ss", "ssr", "vmess", "vless", "trojan", "snell", "anytls", "ssh",
    )
    private val tcpNetworks = setOf("", "tcp", "ws", "grpc", "http", "h2", "xhttp")

    @Volatile
    internal var runtime: WapRuntimeConfig? = null

    override fun apply(yaml: MutableMap<String, Any?>) {
        val config = runtime ?: return
        val removedNames = mutableSetOf<String>()
        val proxies = mutableList(yaml["proxies"])
        val compatible = proxies.mapNotNull { raw ->
            val proxy = mutableMap(raw) ?: return@mapNotNull null
            val name = proxy["name"]?.toString().orEmpty()
            val type = proxy["type"]?.toString()?.lowercase().orEmpty()
            val network = proxy["network"]?.toString()?.lowercase().orEmpty()
            val port = (proxy["port"] as? Number)?.toInt()
            val server = proxy["server"]?.toString().orEmpty()
            val keep = name != PROXY_NAME && type in tcpTypes && network in tcpNetworks &&
                port in ALLOWED_PORTS && !(server == config.proxy.host && port == config.proxy.port)
            if (!keep) {
                if (name.isNotBlank()) removedNames += name
                return@mapNotNull null
            }
            proxy["dialer-proxy"] = PROXY_NAME
            proxy["udp"] = false
            proxy
        }.toMutableList<Any?>()
        compatible += linkedMapOf<String, Any?>(
            "name" to PROXY_NAME,
            "type" to "http",
            "server" to config.proxy.host,
            "port" to config.proxy.port,
            "max-connections" to CORE_CONNECTION_LIMIT,
            "allowed-connect-ports" to ALLOWED_PORTS.sorted(),
        ).apply {
            if (config.proxy.username.isNotBlank()) put("username", config.proxy.username)
            if (config.proxy.password.isNotBlank()) put("password", config.proxy.password)
        }
        yaml["proxies"] = compatible

        patchProxyProviders(yaml, config)
        patchRuleProviders(yaml)
        patchGroups(yaml, removedNames)
        patchRules(yaml)
        patchDns(yaml)

        yaml["tcp-concurrent"] = false
        yaml["disable-keep-alive"] = false
        yaml["keep-alive-idle"] = 10
        yaml["keep-alive-interval"] = 10
        yaml["geo-auto-update"] = false
        mutableMap(yaml["ntp"])?.let { it["enable"] = false }
    }

    private fun patchProxyProviders(yaml: MutableMap<String, Any?>, config: WapRuntimeConfig) {
        mutableStringMap(yaml["proxy-providers"]).forEach { (_, raw) ->
            val provider = mutableMap(raw) ?: return@forEach
            provider["proxy"] = PROXY_NAME
            provider["dialer-proxy"] = PROXY_NAME
            val override = mutableMap(provider["override"]) ?: linkedMapOf()
            override["dialer-proxy"] = PROXY_NAME
            override["udp"] = false
            provider["override"] = override

            val providerHost = runCatching { URL(provider["url"]?.toString()).host }.getOrNull()
            if (!providerHost.isNullOrBlank() && providerHost.equals(config.subscriptionHost, true)) {
                val headers = mutableMap(provider["header"]) ?: linkedMapOf()
                val existing = headers.keys.map { it.lowercase() }.toSet()
                config.subscriptionHeaders.forEach { (key, value) ->
                    if (key.lowercase() !in existing) headers[key] = value
                }
                provider["header"] = headers
            }
        }
    }

    private fun patchRuleProviders(yaml: MutableMap<String, Any?>) {
        mutableStringMap(yaml["rule-providers"]).forEach { (_, raw) ->
            mutableMap(raw)?.set("proxy", PROXY_NAME)
        }
    }

    private fun patchGroups(yaml: MutableMap<String, Any?>, removedNames: Set<String>) {
        mutableList(yaml["proxy-groups"]).forEach { raw ->
            val group = mutableMap(raw) ?: return@forEach
            val entries = mutableList(group["proxies"])
                .mapNotNull { it?.toString() }
                .filterNot { it == "DIRECT" || it == PROXY_NAME || it in removedNames }
                .toMutableList<Any?>()
            if (entries.isEmpty()) entries += "REJECT"
            group["proxies"] = entries
        }
    }

    private fun patchRules(yaml: MutableMap<String, Any?>) {
        val rules = mutableList(yaml["rules"]).mapNotNull { it?.toString() }.map { rule ->
            val parts = rule.split(',').toMutableList()
            parts.indices.forEach { index ->
                if (parts[index].trim() == "DIRECT") parts[index] = "REJECT"
            }
            parts.joinToString(",")
        }.filterNot { it.startsWith("MATCH,") }.toMutableList<Any?>()
        rules.add(0, "NETWORK,UDP,REJECT")
        rules += "MATCH,REJECT"
        yaml["rules"] = rules
    }

    private fun patchDns(yaml: MutableMap<String, Any?>) {
        val dns = mutableMap(yaml["dns"]) ?: linkedMapOf()
        val doh = listOf(
            "https://1.1.1.1/dns-query#$PROXY_NAME",
            "https://8.8.8.8/dns-query#$PROXY_NAME",
        )
        dns["enable"] = true
        dns["respect-rules"] = true
        dns["nameserver"] = doh
        dns["proxy-server-nameserver"] = doh
        dns.remove("fallback")
        dns.remove("fallback-filter")
        dns.remove("default-nameserver")
        yaml["dns"] = dns
    }

    @Suppress("UNCHECKED_CAST")
    private fun mutableMap(value: Any?): MutableMap<String, Any?>? = when (value) {
        is MutableMap<*, *> -> value as? MutableMap<String, Any?>
        is Map<*, *> -> value.entries.associate { it.key.toString() to it.value }.toMutableMap()
        else -> null
    }

    @Suppress("UNCHECKED_CAST")
    private fun mutableStringMap(value: Any?): MutableMap<String, Any?> =
        mutableMap(value) ?: linkedMapOf()

    @Suppress("UNCHECKED_CAST")
    private fun mutableList(value: Any?): MutableList<Any?> = when (value) {
        is MutableList<*> -> value as MutableList<Any?>
        is List<*> -> value.toMutableList()
        else -> mutableListOf()
    }
}
