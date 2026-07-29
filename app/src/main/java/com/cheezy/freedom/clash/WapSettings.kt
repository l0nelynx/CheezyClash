package com.cheezy.freedom.clash

import android.content.Context

enum class WapMode {
    OFF,
    AUTO,
    MANUAL,
}

data class WapSettings(
    val mode: WapMode = WapMode.OFF,
    val host: String = WapSettingsStore.DEFAULT_HOST,
    val port: Int = WapSettingsStore.DEFAULT_PORT,
    val username: String = "",
    val password: String = "",
) {
    val enabled: Boolean get() = mode != WapMode.OFF
}

data class ResolvedWapProxy(
    val host: String,
    val port: Int,
    val username: String = "",
    val password: String = "",
) {
    init {
        require(host.isNotBlank()) { "WAP proxy host is empty" }
        require(port in 1..65535) { "Invalid WAP proxy port: $port" }
    }
}

object WapSettingsStore {
    const val DEFAULT_HOST = "192.168.192.192"
    const val DEFAULT_PORT = 9201

    private const val PREFS = "cheezy.wap"
    private const val KEY_MODE = "mode"
    private const val KEY_HOST = "host"
    private const val KEY_PORT = "port"
    private const val KEY_USERNAME = "username"
    private const val KEY_PASSWORD = "password"

    fun load(context: Context): WapSettings {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val mode = runCatching {
            WapMode.valueOf(prefs.getString(KEY_MODE, WapMode.OFF.name) ?: WapMode.OFF.name)
        }.getOrDefault(WapMode.OFF)
        return WapSettings(
            mode = mode,
            host = prefs.getString(KEY_HOST, DEFAULT_HOST)?.trim().orEmpty().ifBlank { DEFAULT_HOST },
            port = prefs.getInt(KEY_PORT, DEFAULT_PORT).takeIf { it in 1..65535 } ?: DEFAULT_PORT,
            username = prefs.getString(KEY_USERNAME, "").orEmpty(),
            password = prefs.getString(KEY_PASSWORD, "").orEmpty(),
        )
    }

    fun save(context: Context, settings: WapSettings) {
        require(settings.host.isNotBlank()) { "WAP proxy host is empty" }
        require(settings.port in 1..65535) { "Invalid WAP proxy port" }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_MODE, settings.mode.name)
            .putString(KEY_HOST, settings.host.trim())
            .putInt(KEY_PORT, settings.port)
            .putString(KEY_USERNAME, settings.username)
            .putString(KEY_PASSWORD, settings.password)
            .commit()
    }

    fun fallbackProxy(settings: WapSettings): ResolvedWapProxy = ResolvedWapProxy(
        host = if (settings.mode == WapMode.MANUAL) settings.host else DEFAULT_HOST,
        port = if (settings.mode == WapMode.MANUAL) settings.port else DEFAULT_PORT,
        username = settings.username,
        password = settings.password,
    )
}
