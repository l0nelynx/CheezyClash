package com.cheezy.freedom.clash

import android.content.Context

data class XrayMuxSettings(
    val enabled: Boolean = true,
    val concurrency: Int = DEFAULT_CONCURRENCY,
    val maxConnections: Int = 0,
) {
    companion object {
        const val DEFAULT_CONCURRENCY = 32
    }
}

object XrayMuxSettingsStore {
    private const val PREFS = "cheezy.xray_mux"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_CONCURRENCY = "concurrency"
    private const val KEY_MAX_CONNECTIONS = "max_connections"

    fun load(context: Context): XrayMuxSettings {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return XrayMuxSettings(
            enabled = runCatching { prefs.getBoolean(KEY_ENABLED, true) }.getOrDefault(true),
            concurrency = runCatching {
                prefs.getInt(KEY_CONCURRENCY, XrayMuxSettings.DEFAULT_CONCURRENCY)
            }.getOrDefault(XrayMuxSettings.DEFAULT_CONCURRENCY)
                .takeIf { it >= 1 } ?: XrayMuxSettings.DEFAULT_CONCURRENCY,
            maxConnections = runCatching { prefs.getInt(KEY_MAX_CONNECTIONS, 0) }
                .getOrDefault(0)
                .takeIf { it >= 0 } ?: 0,
        )
    }

    fun save(context: Context, settings: XrayMuxSettings) {
        require(settings.concurrency >= 1) { "Xray Mux concurrency must be positive" }
        require(settings.maxConnections >= 0) { "Xray Mux max-connections must not be negative" }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, settings.enabled)
            .putInt(KEY_CONCURRENCY, settings.concurrency)
            .putInt(KEY_MAX_CONNECTIONS, settings.maxConnections)
            .commit()
    }
}

object XrayMuxConfigOverride {
    fun apply(yaml: MutableMap<String, Any?>, settings: XrayMuxSettings) {
        val mux = linkedMapOf<String, Any?>("enabled" to settings.enabled)
        if (settings.enabled) {
            mux["concurrency"] = settings.concurrency
            if (settings.maxConnections > 0) {
                mux["max-connections"] = settings.maxConnections
            }
        }

        val proxies = yaml["proxies"] as? List<*>
        if (proxies != null) {
            yaml["proxies"] = proxies.map { raw ->
                val proxy = mutableMap(raw) ?: return@map raw
                val type = proxy["type"]?.toString()?.trim()?.lowercase().orEmpty()
                val flow = proxy["flow"]?.toString()?.trim().orEmpty()
                val network = proxy["network"]?.toString()?.trim()?.lowercase().orEmpty()
                val rawTcp = network.isEmpty() || network == "tcp"
                if (type == "vless" && flow.isEmpty() && rawTcp) {
                    proxy["xray-mux"] = LinkedHashMap(mux)
                }
                proxy
            }
        }

        val providers = mutableMap(yaml["proxy-providers"]) ?: return
        providers.replaceAll { _, raw ->
            val provider = mutableMap(raw) ?: return@replaceAll raw
            val override = mutableMap(provider["override"]) ?: linkedMapOf()
            override["xray-mux"] = LinkedHashMap(mux)
            provider["override"] = override
            provider
        }
        yaml["proxy-providers"] = providers
    }

    @Suppress("UNCHECKED_CAST")
    private fun mutableMap(value: Any?): MutableMap<String, Any?>? = when (value) {
        is MutableMap<*, *> -> value as? MutableMap<String, Any?>
        is Map<*, *> -> value.entries.associate { it.key.toString() to it.value }.toMutableMap()
        else -> null
    }
}
