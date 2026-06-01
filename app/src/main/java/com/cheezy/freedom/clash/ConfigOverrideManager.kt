package com.cheezy.freedom.clash

import android.content.Context
import com.cheezy.freedom.ui.main.dialogs.ShareVpnInfo
import org.yaml.snakeyaml.DumperOptions
import org.yaml.snakeyaml.Yaml
import java.io.File

object ConfigOverrideManager {
    private const val PREFS = "cheezy.overrides"
    internal const val BASE_FILE_NAME = "base.yaml"
    internal const val CONFIG_FILE_NAME = "config.yaml"

    private val registry: List<ConfigOverride> = listOf(LocalProxyOverride)

    fun isEnabled(context: Context, id: String): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(id, false)

    fun isForcedByBase(context: Context, id: String): Boolean {
        val override = registry.firstOrNull { it.id == id } ?: return false
        ensureBaseExists(context)
        val base = readMap(File(clashDir(context), BASE_FILE_NAME)) ?: return false
        return override.isForcedByBase(base)
    }

    /**
     * Persist the new state, rebuild config.yaml, then ask the core to reload
     * and reapply user selections. A call with an unknown id is a no-op.
     */
    suspend fun setEnabled(context: Context, id: String, value: Boolean) {
        if (registry.none { it.id == id }) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(id, value)
            .apply()
        rebuild(context)
        ConfigManager.reloadAndReapplySelections(context)
    }

    /**
     * Reads base.yaml, applies every enabled override, writes the result to
     * config.yaml. No-op when base.yaml does not exist. Errors are caught and
     * logged so a malformed config never crashes the caller; in that case
     * config.yaml is left untouched.
     */
    fun rebuild(context: Context) {
        ensureBaseExists(context)
        val enabled = registry.filter { isEnabled(context, it.id) }.map { it.id }.toSet()
        rebuildInDir(clashDir(context), enabled)
    }

    /** Pure helper for unit tests: operate on an explicit clash directory and id set. */
    internal fun rebuildInDir(clash: File, enabledIds: Set<String>) {
        val base = File(clash, BASE_FILE_NAME)
        if (!base.exists()) return
        val map = runCatching { readMap(base) }.getOrNull()?.toMutableMap() ?: return

        registry.forEach { override ->
            if (override.id in enabledIds) override.apply(map)
        }

        val dumperOptions = DumperOptions().apply {
            defaultFlowStyle = DumperOptions.FlowStyle.BLOCK
            indent = 2
            isPrettyFlow = true
        }
        val text = Yaml(dumperOptions).dump(map)
        runCatching {
            File(clash, CONFIG_FILE_NAME).writeText(text)
        }.onFailure {
            android.util.Log.e("ConfigOverrideManager", "Failed to write config.yaml", it)
        }
    }

    internal fun ensureBaseExists(context: Context) {
        val clash = clashDir(context)
        val base = File(clash, BASE_FILE_NAME)
        val config = File(clash, CONFIG_FILE_NAME)
        if (!base.exists() && config.exists()) {
            runCatching { config.copyTo(base, overwrite = false) }
        }
    }

    internal fun clashDir(context: Context): File =
        context.filesDir.resolve("clash")

    internal fun clearPrefs(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().clear().apply()
    }

    @Suppress("UNCHECKED_CAST")
    private fun readMap(file: File): Map<String, Any?>? {
        if (!file.exists()) return null
        val loaded = runCatching { Yaml().load<Any?>(file.readText()) }.getOrNull()
        return loaded as? Map<String, Any?>
    }

    /**
     * Reads the effective config.yaml for ports and computes UI flags for the
     * share dialog. Tolerates missing files and parse failures — always returns
     * a valid (possibly EMPTY) instance.
     */
    fun readShareInfo(context: Context): ShareVpnInfo {
        ensureBaseExists(context)
        val config = readMap(File(clashDir(context), CONFIG_FILE_NAME))
        val ports = if (config == null) Ports.EMPTY else extractPorts(config)
        return ShareVpnInfo(
            mixedPort = ports.mixedPort,
            httpPort = ports.httpPort,
            socksPort = ports.socksPort,
            localProxyEnabled = isEnabled(context, LocalProxyOverride.id),
            localProxyForcedByBase = isForcedByBase(context, LocalProxyOverride.id),
        )
    }

    /** Public-by-test entry point used by ShareVpnInfoParserTest. */
    internal fun parsePortsForTest(yamlText: String): Ports {
        val loaded = runCatching { Yaml().load<Any?>(yamlText) }.getOrNull()
        @Suppress("UNCHECKED_CAST")
        val map = loaded as? Map<String, Any?> ?: return Ports.EMPTY
        return extractPorts(map)
    }

    internal data class Ports(
        val mixedPort: Int?,
        val httpPort: Int?,
        val socksPort: Int?,
    ) {
        companion object {
            val EMPTY = Ports(null, null, null)
        }
    }

    private fun extractPorts(map: Map<String, Any?>): Ports = Ports(
        mixedPort = (map["mixed-port"] as? Number)?.toInt(),
        httpPort = (map["port"] as? Number)?.toInt(),
        socksPort = (map["socks-port"] as? Number)?.toInt(),
    )
}
