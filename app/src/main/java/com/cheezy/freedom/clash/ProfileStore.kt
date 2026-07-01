package com.cheezy.freedom.clash

import android.content.Context
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Single source of truth for the profile catalog and which profile is active.
 *
 * Disk layout:
 * ```
 * filesDir/clash/          ← core HOME (shared static: cache.db, geodata, override.json)
 * filesDir/profiles/<id>/  ← per-profile config: base.yaml, config.yaml, providers/
 * ```
 * The core's HOME is fixed once in [ClashCore.init]; only the *load directory*
 * (a profile dir) changes when switching profiles, which keeps rule/proxy
 * providers isolated per profile while geodata/cache stay shared.
 *
 * Persisted in SharedPreferences `cheezy.profiles` as a JSON list plus the
 * active id. Accessed from both the main and `:vpn` processes; the `:vpn`
 * process only reads [activeDir] on a fresh (OS-restarted) process, where the
 * on-disk value is authoritative. During normal operation the active dir is
 * handed to `:vpn` via Intent extras / loadConfig, never via its prefs cache.
 */
object ProfileStore {
    private const val PREFS = "cheezy.profiles"
    private const val KEY_LIST = "profiles_json"
    private const val KEY_ACTIVE = "active_profile_id"

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Unsorted decode — used internally for mutations that must preserve identity. */
    private fun rawList(context: Context): List<Profile> {
        val text = prefs(context).getString(KEY_LIST, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<Profile>>(text) }.getOrDefault(emptyList())
    }

    private fun save(context: Context, items: List<Profile>) {
        prefs(context).edit().putString(KEY_LIST, json.encodeToString(items)).apply()
    }

    /** Managed profile(s) first, then by insertion order. Stable. */
    fun list(context: Context): List<Profile> =
        rawList(context).sortedWith(
            compareByDescending<Profile> { it.managed }.thenBy { it.order }
        )

    fun get(context: Context, id: String): Profile? = rawList(context).firstOrNull { it.id == id }

    fun activeId(context: Context): String? = prefs(context).getString(KEY_ACTIVE, null)

    fun active(context: Context): Profile? = activeId(context)?.let { get(context, it) }

    fun setActive(context: Context, id: String?) {
        prefs(context).edit().apply {
            if (id == null) remove(KEY_ACTIVE) else putString(KEY_ACTIVE, id)
        }.apply()
    }

    fun isEmpty(context: Context): Boolean = rawList(context).isEmpty()

    fun nextOrder(context: Context): Long =
        (rawList(context).maxOfOrNull { it.order } ?: 0L) + 1L

    // --- Directories -------------------------------------------------------

    fun profilesRoot(context: Context): File =
        context.filesDir.resolve("profiles")

    fun dir(context: Context, id: String): File =
        profilesRoot(context).resolve(id).apply { mkdirs() }

    /**
     * Directory the core should load. Points at the active profile; falls back
     * to the legacy `clash/` home only before the first profile exists (where
     * there is no config to load anyway).
     */
    fun activeDir(context: Context): File {
        val id = activeId(context)
        return if (id != null) dir(context, id) else context.filesDir.resolve("clash")
    }

    // --- Mutations ---------------------------------------------------------

    fun upsert(context: Context, profile: Profile) {
        val items = rawList(context).toMutableList()
        val idx = items.indexOfFirst { it.id == profile.id }
        if (idx >= 0) items[idx] = profile else items.add(profile)
        save(context, items)
    }

    /**
     * Removes a user profile and its on-disk directory + per-profile selections.
     * No-op for managed profiles. Returns the id that became active afterward
     * (the caller reloads it), or null if none remain / the active one was not
     * touched. When the removed profile was active, the first remaining profile
     * becomes active.
     */
    fun remove(context: Context, id: String): String? {
        val items = rawList(context)
        val target = items.firstOrNull { it.id == id } ?: return null
        if (target.managed) return null

        save(context, items.filterNot { it.id == id })
        runCatching { dir(context, id).deleteRecursively() }
        ConfigManager.clearProfileSelections(context, id)

        if (activeId(context) == id) {
            val next = list(context).firstOrNull()?.id
            setActive(context, next)
            return next
        }
        return null
    }
}
