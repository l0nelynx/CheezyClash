package com.cheezy.freedom.clash

object LocalProxyOverride : ConfigOverride {
    override val id: String = "local-proxy"

    private val ALLOWED_IPS = listOf(
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
    )

    override fun apply(yaml: MutableMap<String, Any?>) {
        yaml["mixed-port"] = 2080
        yaml["authentication"] = emptyList<String>()
        yaml["lan-allowed-ips"] = ALLOWED_IPS
        yaml["allow-lan"] = true
    }

    override fun isForcedByBase(baseYaml: Map<String, Any?>): Boolean =
        baseYaml["allow-lan"] == true
}
