package com.cheezy.freedom.clash

import android.content.Context
import android.os.Build
import android.util.Base64
import com.cheezy.freedom.ui.main.proxies.ProxyUiData
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.yaml.snakeyaml.Yaml
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

object ConfigManager {
    private const val PREFS_SELECTIONS = "cheezy.selections"
    private const val PREFS_PROXY_CACHE = "cheezy.proxy_cache"
    private const val KEY_PROXY_GROUPS_JSON = "proxy_groups_json"
    private const val FILE_NAME = "config.yaml"

    private const val PREFS_ACCESS_CONTROL = "cheezy.access_control"
    private const val KEY_AC_ENABLED = "enabled"
    private const val KEY_AC_FORCE_INCLUDED = "force_included"
    private const val KEY_AC_FORCE_EXCLUDED = "force_excluded"

    private val json = Json { ignoreUnknownKeys = true }

    /** Result of a raw subscription download (no persistence side effects). */
    data class DownloadMeta(
        val name: String,
        val subscription: SubscriptionInfo,
        val intervalHours: Int,
    )

    /**
     * Downloads a clash YAML from [urlString] into `targetDir/base.yaml` and
     * returns the parsed subscription metadata. Pure I/O — it does NOT touch any
     * global prefs, ClashState, or the core; the caller (ProfileManager) owns
     * where the download lands and what to do with the metadata.
     *
     * Request headers (x-hwid, x-device-*) are always sent — useful even for the
     * open client for unique device identification on the subscription server.
     * Response header checks specific to a backend live in [validateHeaders]
     * (called after HTTP 2xx, before reading the body). Open passes an empty
     * lambda (accepts any YAML); proprietary passes a Cheezy-header validator.
     */
    suspend fun downloadBase(
        context: Context,
        urlString: String,
        targetDir: File,
        validateHeaders: (HttpURLConnection) -> Unit = {},
    ): DownloadMeta {
        val url = URL(urlString)
        // App name differs per flavor: open → CheezyClash, proprietary → CheezyVPN.
        val appName = if (com.cheezy.freedom.BuildConfig.EDITION == "OPEN") "CheezyClash" else "CheezyVPN"
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 30_000
            setRequestProperty("content-type", "application/json")
            setRequestProperty("x-hwid", DeviceId.get(context))
            setRequestProperty("x-device-os", "Android")
            setRequestProperty("x-ver-os", Build.VERSION.RELEASE ?: Build.VERSION.SDK_INT.toString())
            setRequestProperty("x-device-model", Build.MODEL ?: "unknown")
            setRequestProperty("user-agent", "$appName/${com.cheezy.freedom.BuildConfig.EDITION}/${com.cheezy.freedom.BuildConfig.VERSION_NAME}")
            instanceFollowRedirects = true
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = runCatching { conn.errorStream?.bufferedReader()?.use { it.readText() } }.getOrNull()
                throw IOException("HTTP $code: ${err?.take(200) ?: conn.responseMessage}")
            }

            validateHeaders(conn)

            val name = parseFilename(conn.getHeaderField("content-disposition"))
                ?: url.path.substringAfterLast('/').takeIf { it.isNotBlank() }
                ?: FILE_NAME

            val sub = SubscriptionInfo(
                title = decodeMaybeBase64(conn.getHeaderField("profile-title")),
                announce = decodeMaybeBase64(conn.getHeaderField("announce")),
                tag = decodeMaybeBase64(conn.getHeaderField("subscription-tag") ?: conn.getHeaderField("profile-tag"))
            ).mergeUserInfo(conn.getHeaderField("subscription-userinfo"))

            val intervalHours = conn.getHeaderField("profile-update-interval")?.toIntOrNull() ?: 0

            targetDir.mkdirs()
            val target = targetDir.resolve(ConfigOverrideManager.BASE_FILE_NAME)
            conn.inputStream.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }

            return DownloadMeta(name, sub, intervalHours)
        } finally {
            conn.disconnect()
        }
    }

    /** True if the active profile has a materialized config.yaml on disk. */
    fun hasConfig(context: Context): Boolean = configFile(context).exists()

    /**
     * Tells the core to reload config.yaml from [dir] (defaults to the active
     * profile dir), waits briefly, then replays user-saved selector choices on
     * top of the freshly loaded groups. Shared between profile switch/refresh
     * and ConfigOverrideManager.setEnabled.
     */
    suspend fun reloadAndReapplySelections(
        context: Context,
        dir: File = ProfileStore.activeDir(context),
    ) {
        runCatching {
            ClashRemoteManager.loadConfig(dir.absolutePath)
            kotlinx.coroutines.delay(200)

            val currentGroups = ClashRemoteManager.queryGroupNames(false).toSet()
            getSavedSelections(context).forEach { (group, proxy) ->
                if (group !in currentGroups) return@forEach
                runCatching {
                    if (!ClashRemoteManager.patchSelector(group, proxy)) {
                        ClashRemoteManager.queryGroup(group)?.now?.let { fallback ->
                            saveSelectedProxy(context, group, fallback)
                        }
                    }
                }
            }
        }
    }

    /** Full reset (logout): wipes profile catalog, all profile dirs, the core
     *  home, selections, proxy cache and overrides. */
    fun clearAll(context: Context) {
        clearSavedSelections(context)
        clearAllProfileSelections(context)
        clearProxyGroupsCache(context)
        ConfigOverrideManager.clearPrefs(context)
        context.getSharedPreferences("cheezy.profiles", Context.MODE_PRIVATE).edit().clear().apply()
        runCatching { ProfileStore.profilesRoot(context).deleteRecursively() }
        runCatching { context.filesDir.resolve("clash").deleteRecursively() }
        ClashState.setSubscription(null)
        ClashState.setLastUpdateTime(0L)
    }

    // --- Proxy groups cache ------------------------------------------------

    /**
     * Cache of the last successful proxyGroups snapshot so the Proxies tab shows
     * up-to-date groups from the last session during a cold start.
     */
    fun saveProxyGroupsCache(context: Context, groups: List<Pair<String, List<ProxyUiData>>>) {
        val text = runCatching { json.encodeToString(groups) }.getOrNull() ?: return
        context.getSharedPreferences(PREFS_PROXY_CACHE, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PROXY_GROUPS_JSON, text)
            .apply()
    }

    fun loadProxyGroupsCache(context: Context): List<Pair<String, List<ProxyUiData>>>? {
        val text = context.getSharedPreferences(PREFS_PROXY_CACHE, Context.MODE_PRIVATE)
            .getString(KEY_PROXY_GROUPS_JSON, null) ?: return null
        return runCatching { json.decodeFromString<List<Pair<String, List<ProxyUiData>>>>(text) }
            .getOrNull()?.takeIf { it.isNotEmpty() }
    }

    private fun clearProxyGroupsCache(context: Context) {
        context.getSharedPreferences(PREFS_PROXY_CACHE, Context.MODE_PRIVATE)
            .edit().clear().apply()
    }

    // --- Selections (per active profile) -----------------------------------

    fun saveSelectedProxy(context: Context, group: String, proxy: String) {
        context.getSharedPreferences(PREFS_SELECTIONS, Context.MODE_PRIVATE)
            .edit()
            .putString(group, proxy)
            .apply()
    }

    fun getSavedSelections(context: Context): Map<String, String> {
        val prefs = context.getSharedPreferences(PREFS_SELECTIONS, Context.MODE_PRIVATE)
        return prefs.all.filterValues { it is String }.mapValues { it.value as String }
    }

    fun clearSavedSelections(context: Context) {
        context.getSharedPreferences(PREFS_SELECTIONS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }

    private fun profileSelectionsPrefs(id: String) = "$PREFS_SELECTIONS.$id"

    /** Copies the active selection set into the per-profile snapshot for [id]. */
    fun snapshotSelectionsTo(context: Context, id: String) {
        val current = getSavedSelections(context)
        val target = context.getSharedPreferences(profileSelectionsPrefs(id), Context.MODE_PRIVATE).edit()
        target.clear()
        current.forEach { (group, proxy) -> target.putString(group, proxy) }
        target.apply()
    }

    /** Loads the per-profile snapshot for [id] into the active selection set. */
    fun restoreSelectionsFrom(context: Context, id: String) {
        val snap = context.getSharedPreferences(profileSelectionsPrefs(id), Context.MODE_PRIVATE)
            .all.filterValues { it is String }.mapValues { it.value as String }
        val active = context.getSharedPreferences(PREFS_SELECTIONS, Context.MODE_PRIVATE).edit()
        active.clear()
        snap.forEach { (group, proxy) -> active.putString(group, proxy) }
        active.apply()
    }

    fun clearProfileSelections(context: Context, id: String) {
        context.getSharedPreferences(profileSelectionsPrefs(id), Context.MODE_PRIVATE)
            .edit().clear().apply()
    }

    private fun clearAllProfileSelections(context: Context) {
        ProfileStore.list(context).forEach { clearProfileSelections(context, it.id) }
    }

    // --- YAML readers (operate on a profile dir) ---------------------------

    private fun parseFilename(header: String?): String? {
        if (header.isNullOrBlank()) return null
        val match = Regex("""filename\*?=(?:UTF-8'')?"?([^";]+)"?""", RegexOption.IGNORE_CASE).find(header)
        return match?.groupValues?.get(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun configFile(context: Context): File = ProfileStore.activeDir(context).resolve(FILE_NAME)

    private fun loadConfigMap(configFile: File): Map<String, Any?>? {
        if (!configFile.exists()) return null
        @Suppress("UNCHECKED_CAST")
        return runCatching {
            Yaml().load<Any>(configFile.readText()) as? Map<String, Any?>
        }.getOrNull()
    }

    fun readTunStack(context: Context): String? = readTunStack(ProfileStore.activeDir(context))
    fun readTunStack(dir: File): String? {
        val config = loadConfigMap(dir.resolve(FILE_NAME)) ?: return null
        val tun = config["tun"] as? Map<*, *> ?: return null
        return tun["stack"]?.toString()?.trim('"', '\'')
    }

    fun readFakeIpRange(context: Context): String? {
        val config = loadConfigMap(configFile(context)) ?: return null
        val dns = config["dns"] as? Map<*, *> ?: return null
        return dns["fake-ip-range"]?.toString()?.trim('"', '\'')
    }

    /**
     * Parses the `proxy-groups` block of the active config and returns a map:
     * group name -> drawable resource name from `icon-cheezy` (`@drawable/foo` or `foo`).
     */
    fun readGroupIcons(context: Context): Map<String, String> {
        val file = configFile(context)
        if (!file.exists()) return emptyMap()

        return runCatching {
            val text = file.readText()
            @Suppress("UNCHECKED_CAST")
            val yaml = Yaml().load<Any>(text) as? Map<String, Any?> ?: return emptyMap()
            val groups = yaml["proxy-groups"] as? List<Any?> ?: return emptyMap()

            val result = LinkedHashMap<String, String>()
            for (item in groups) {
                val map = item as? Map<*, *> ?: continue
                val name = map["name"]?.toString() ?: continue
                val icon = map["icon-cheezy"]?.toString() ?: continue
                val resName = icon.removePrefix("@drawable/").trim()
                if (resName.isNotBlank()) result[name] = resName
            }
            result
        }.getOrDefault(emptyMap())
    }

    fun readExcludePackages(context: Context): List<String> = readExcludePackages(ProfileStore.activeDir(context))
    fun readExcludePackages(dir: File): List<String> {
        val config = loadConfigMap(dir.resolve(FILE_NAME)) ?: return emptyList()
        val tun = config["tun"] as? Map<*, *> ?: return emptyList()
        val list = tun["exclude-package"] as? List<*> ?: return emptyList()
        return list.mapNotNull { it?.toString()?.trim('"', '\'') }
    }

    // --- Access control ----------------------------------------------------

    fun isAccessControlEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFS_ACCESS_CONTROL, Context.MODE_PRIVATE)
            .getBoolean(KEY_AC_ENABLED, false)

    fun setAccessControlEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS_ACCESS_CONTROL, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_AC_ENABLED, enabled).apply()
    }

    fun getUserForceIncluded(context: Context): Set<String> =
        context.getSharedPreferences(PREFS_ACCESS_CONTROL, Context.MODE_PRIVATE)
            .getStringSet(KEY_AC_FORCE_INCLUDED, emptySet()) ?: emptySet()

    fun saveUserForceIncluded(context: Context, packages: Set<String>) {
        context.getSharedPreferences(PREFS_ACCESS_CONTROL, Context.MODE_PRIVATE)
            .edit().putStringSet(KEY_AC_FORCE_INCLUDED, packages).apply()
    }

    fun getUserForceExcluded(context: Context): Set<String> =
        context.getSharedPreferences(PREFS_ACCESS_CONTROL, Context.MODE_PRIVATE)
            .getStringSet(KEY_AC_FORCE_EXCLUDED, emptySet()) ?: emptySet()

    fun saveUserForceExcluded(context: Context, packages: Set<String>) {
        context.getSharedPreferences(PREFS_ACCESS_CONTROL, Context.MODE_PRIVATE)
            .edit().putStringSet(KEY_AC_FORCE_EXCLUDED, packages).apply()
    }

    fun computeEffectiveExcludePackages(context: Context): List<String> {
        val base = readExcludePackages(context).toMutableSet()
        if (!isAccessControlEnabled(context)) return base.toList()
        base -= getUserForceIncluded(context)
        base += getUserForceExcluded(context)
        return base.toList()
    }

    // --- helpers -----------------------------------------------------------

    private fun decodeMaybeBase64(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (!value.startsWith("base64:")) return value
        val payload = value.removePrefix("base64:").trim()
        return runCatching {
            String(Base64.decode(payload, Base64.DEFAULT), Charsets.UTF_8)
        }.getOrElse { value }
    }

    private fun SubscriptionInfo.mergeUserInfo(header: String?): SubscriptionInfo {
        if (header.isNullOrBlank()) return this
        val parts = header.split(';').mapNotNull {
            val kv = it.trim().split('=', limit = 2)
            if (kv.size == 2) kv[0].trim().lowercase() to kv[1].trim() else null
        }.toMap()
        return copy(
            upload = parts["upload"]?.toLongOrNull() ?: 0,
            download = parts["download"]?.toLongOrNull() ?: 0,
            total = parts["total"]?.toLongOrNull() ?: 0,
            expire = parts["expire"]?.toLongOrNull() ?: 0,
        )
    }
}
