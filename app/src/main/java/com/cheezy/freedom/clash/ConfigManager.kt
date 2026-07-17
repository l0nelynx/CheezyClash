package com.cheezy.freedom.clash

import android.content.Context
import android.os.Build
import com.cheezy.freedom.ui.main.proxies.ProxyUiData
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
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
    private const val MAX_DOWNLOAD_BYTES = 20L * 1024 * 1024 // 20 MB

    suspend fun downloadBase(
        context: Context,
        urlString: String,
        targetDir: File,
        validateHeaders: (HttpURLConnection) -> Unit = {},
    ): DownloadMeta {
        val initialUrl = URL(urlString)
        requireHttps(initialUrl)

        // App name differs per flavor: open → CheezyClash, proprietary → CheezyVPN.
        val appName = if (com.cheezy.freedom.BuildConfig.EDITION == "OPEN") "CheezyClash" else "CheezyVPN"
        val conn = openSubscriptionConnection(initialUrl, context, appName)
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = runCatching { conn.errorStream?.bufferedReader()?.use { it.readText() } }.getOrNull()
                throw IOException("HTTP $code: ${err?.take(200) ?: conn.responseMessage}")
            }
            // Re-validate final URL after redirects (HttpURLConnection follows same-protocol by default).
            requireHttps(conn.url)

            validateHeaders(conn)

            val name = ConfigYamlParsers.parseFilename(conn.getHeaderField("content-disposition"))
                ?: conn.url.path.substringAfterLast('/').takeIf { it.isNotBlank() }
                ?: FILE_NAME

            val sub = SubscriptionInfo(
                title = ConfigYamlParsers.decodeMaybeBase64(conn.getHeaderField("profile-title")),
                announce = ConfigYamlParsers.decodeMaybeBase64(conn.getHeaderField("announce")),
                tag = ConfigYamlParsers.decodeMaybeBase64(
                    conn.getHeaderField("subscription-tag") ?: conn.getHeaderField("profile-tag")
                )
            ).let { ConfigYamlParsers.mergeUserInfo(it, conn.getHeaderField("subscription-userinfo")) }

            val intervalHours = conn.getHeaderField("profile-update-interval")?.toIntOrNull() ?: 0

            val contentLength = conn.contentLengthLong
            if (contentLength > MAX_DOWNLOAD_BYTES) {
                throw IOException("Subscription too large (${contentLength} bytes)")
            }

            targetDir.mkdirs()
            val target = targetDir.resolve(ConfigOverrideManager.BASE_FILE_NAME)
            conn.inputStream.use { input ->
                target.outputStream().use { output ->
                    var copied = 0L
                    val buf = ByteArray(8 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        copied += n
                        if (copied > MAX_DOWNLOAD_BYTES) {
                            throw IOException("Subscription exceeded size limit ($MAX_DOWNLOAD_BYTES bytes)")
                        }
                        output.write(buf, 0, n)
                    }
                }
            }

            return DownloadMeta(name, sub, intervalHours)
        } finally {
            conn.disconnect()
        }
    }

    private fun requireHttps(url: URL) {
        if (!url.protocol.equals("https", ignoreCase = true)) {
            throw IOException("Only https:// subscription URLs are allowed (got ${url.protocol})")
        }
    }

    private fun openSubscriptionConnection(
        url: URL,
        context: Context,
        appName: String,
    ): HttpURLConnection {
        return (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 30_000
            setRequestProperty("Accept", "text/yaml, text/plain, application/octet-stream, */*")
            setRequestProperty("x-hwid", DeviceId.get(context))
            setRequestProperty("x-device-os", "Android")
            setRequestProperty("x-ver-os", Build.VERSION.RELEASE ?: Build.VERSION.SDK_INT.toString())
            setRequestProperty("x-device-model", Build.MODEL ?: "unknown")
            setRequestProperty(
                "user-agent",
                "$appName/${com.cheezy.freedom.BuildConfig.EDITION}/${com.cheezy.freedom.BuildConfig.VERSION_NAME}"
            )
            // Follow redirects but requireHttps() re-checks the final URL.
            instanceFollowRedirects = true
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

    private fun configFile(context: Context): File = ProfileStore.activeDir(context).resolve(FILE_NAME)

    fun readTunStack(context: Context): String? = ConfigYamlParsers.readTunStack(ProfileStore.activeDir(context))
    fun readTunStack(dir: File): String? = ConfigYamlParsers.readTunStack(dir)

    fun readFakeIpRange(context: Context): String? =
        ConfigYamlParsers.readFakeIpRange(configFile(context))

    /**
     * Parses the `proxy-groups` block of the active config and returns a map:
     * group name -> drawable resource name from `icon-cheezy` (`@drawable/foo` or `foo`).
     */
    fun readGroupIcons(context: Context): Map<String, String> =
        ConfigYamlParsers.readGroupIcons(configFile(context))

    fun readExcludePackages(context: Context): List<String> =
        ConfigYamlParsers.readExcludePackages(ProfileStore.activeDir(context))
    fun readExcludePackages(dir: File): List<String> =
        ConfigYamlParsers.readExcludePackages(dir)

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

    fun computeEffectiveExcludePackages(context: Context): List<String> =
        ConfigYamlParsers.computeEffectiveExcludePackages(
            base = readExcludePackages(context),
            enabled = isAccessControlEnabled(context),
            forceIncluded = getUserForceIncluded(context),
            forceExcluded = getUserForceExcluded(context),
        )
}
