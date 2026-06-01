package com.cheezy.freedom.clash

import android.content.Context
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
        val base = readBaseMap(context) ?: return false
        return override.isForcedByBase(base)
    }

    /**
     * One-shot migration: when an older install has only config.yaml (no base.yaml),
     * snapshot the current config as the base. Idempotent and cheap; called by
     * every code path that needs base.yaml.
     */
    internal fun ensureBaseExists(context: Context) {
        val clash = clashDir(context)
        val base = File(clash, BASE_FILE_NAME)
        val config = File(clash, CONFIG_FILE_NAME)
        if (!base.exists() && config.exists()) {
            config.copyTo(base, overwrite = false)
        }
    }

    internal fun clashDir(context: Context): File =
        context.filesDir.resolve("clash")

    internal fun clearPrefs(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().clear().apply()
    }

    /** Stub — filled in by Task 5. */
    private fun readBaseMap(context: Context): Map<String, Any?>? = null
}
