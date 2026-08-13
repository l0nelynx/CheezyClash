package com.cheezy.freedom.clash

import android.content.Context

data class XrayMuxSettings(
    val enabled: Boolean = DEFAULT_ENABLED,
    val concurrency: Int = DEFAULT_CONCURRENCY,
    val maxConnections: Int = DEFAULT_MAX_CONNECTIONS,
    /** 0 means omitted from generated YAML / unlimited. */
    val maxDialsPerMinute: Int = DEFAULT_MAX_DIALS_PER_MINUTE,
) {
    companion object {
        const val DEFAULT_ENABLED = false
        const val DEFAULT_CONCURRENCY = 32
        const val DEFAULT_MAX_CONNECTIONS = 3
        const val DEFAULT_MAX_DIALS_PER_MINUTE = 3
    }
}

object XrayMuxSettingsStore {
    private const val PREFS = "cheezy.xray_mux"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_CONCURRENCY = "concurrency"
    private const val KEY_MAX_CONNECTIONS = "max_connections"
    private const val KEY_MAX_DIALS_PER_MINUTE = "max_dials_per_minute"

    fun load(context: Context): XrayMuxSettings {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return XrayMuxSettings(
            enabled = runCatching {
                prefs.getBoolean(KEY_ENABLED, XrayMuxSettings.DEFAULT_ENABLED)
            }.getOrDefault(XrayMuxSettings.DEFAULT_ENABLED),
            concurrency = runCatching {
                prefs.getInt(KEY_CONCURRENCY, XrayMuxSettings.DEFAULT_CONCURRENCY)
            }.getOrDefault(XrayMuxSettings.DEFAULT_CONCURRENCY)
                .takeIf { it >= 1 } ?: XrayMuxSettings.DEFAULT_CONCURRENCY,
            maxConnections = runCatching {
                prefs.getInt(KEY_MAX_CONNECTIONS, XrayMuxSettings.DEFAULT_MAX_CONNECTIONS)
            }.getOrDefault(XrayMuxSettings.DEFAULT_MAX_CONNECTIONS)
                .takeIf { it >= 0 } ?: XrayMuxSettings.DEFAULT_MAX_CONNECTIONS,
            maxDialsPerMinute = runCatching {
                prefs.getInt(KEY_MAX_DIALS_PER_MINUTE, XrayMuxSettings.DEFAULT_MAX_DIALS_PER_MINUTE)
            }.getOrDefault(XrayMuxSettings.DEFAULT_MAX_DIALS_PER_MINUTE)
                .takeIf { it >= 0 } ?: XrayMuxSettings.DEFAULT_MAX_DIALS_PER_MINUTE,
        )
    }

    fun save(context: Context, settings: XrayMuxSettings) {
        require(settings.concurrency >= 1) { "Xray Mux concurrency must be positive" }
        require(settings.maxConnections >= 0) { "Xray Mux max-connections must not be negative" }
        require(settings.maxDialsPerMinute >= 0) {
            "Xray Mux max-dials-per-minute must not be negative"
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, settings.enabled)
            .putInt(KEY_CONCURRENCY, settings.concurrency)
            .putInt(KEY_MAX_CONNECTIONS, settings.maxConnections)
            .putInt(KEY_MAX_DIALS_PER_MINUTE, settings.maxDialsPerMinute)
            .commit()
    }
}

object XrayMuxConfigOverride {
    fun apply(yaml: MutableMap<String, Any?>, settings: XrayMuxSettings) {
        val mux = linkedMapOf<String, Any?>("enabled" to settings.enabled)
        if (settings.enabled) {
            mux["concurrency"] = settings.concurrency
            // 0 = pack-first / unlimited — omit so core keeps its default semantics.
            if (settings.maxConnections > 0) {
                mux["max-connections"] = settings.maxConnections
            }
            if (settings.maxDialsPerMinute > 0) {
                mux["max-dials-per-minute"] = settings.maxDialsPerMinute
            }
            // Other knobs (e.g. max-worker-uses) stay unset until explicitly configured.
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
