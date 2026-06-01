package com.cheezy.freedom.clash

import android.content.Context
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
}
