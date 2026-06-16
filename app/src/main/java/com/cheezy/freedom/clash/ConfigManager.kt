package com.cheezy.freedom.clash

import android.content.Context
import android.os.Build
import android.util.Base64
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.ui.main.proxies.ProxyUiData
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

object ConfigManager {
    private const val PREFS = "cheezy.config"
    private const val KEY_NAME = "config_name"
    private const val KEY_URL = "config_url"
    private const val KEY_SUB = "subscription_json"
    private const val KEY_UPDATE_TIME = "last_update_time"
    private const val KEY_INTERVAL = "update_interval"
    private const val PREFS_SELECTIONS = "cheezy.selections"
    private const val PREFS_PROXY_CACHE = "cheezy.proxy_cache"
    private const val KEY_PROXY_GROUPS_JSON = "proxy_groups_json"
    private const val FILE_NAME = "config.yaml"

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Downloads clash YAML from URL. Request headers (x-hwid, x-device-*) are always sent —
     * they are useful even for the open client for unique device identification on the
     * subscription server side, if it uses them.
     *
     * Response header checks specific to a particular backend are moved to
     * [validateHeaders] (called AFTER HTTP status 2xx, but BEFORE reading the body). In the open
     * version, the lambda is empty — we accept any response. In the proprietary version,
     * CheezySubscriptionGateway passes a lambda that checks the `<prop header>` and throws an
     * IOException otherwise.
     */
    suspend fun importFromUrl(
        context: Context,
        urlString: String,
        validateHeaders: (HttpURLConnection) -> Unit = {},
    ): String {
        val url = URL(urlString)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 30_000
            setRequestProperty("content-type", "application/json")
            setRequestProperty("x-hwid", DeviceId.get(context))
            setRequestProperty("x-device-os", "Android")
            setRequestProperty("x-ver-os", Build.VERSION.RELEASE ?: Build.VERSION.SDK_INT.toString())
            setRequestProperty("x-device-model", Build.MODEL ?: "unknown")
            setRequestProperty("user-agent", "CheezyVPN/${com.cheezy.freedom.BuildConfig.EDITION}/${com.cheezy.freedom.BuildConfig.VERSION_NAME}")
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

            val home = context.filesDir.resolve("clash").apply { mkdirs() }
            // Download lands in base.yaml; the effective config.yaml is then
            // produced by ConfigOverrideManager.rebuild(...) after we've
            // persisted prefs/subscription state below.
            val target = home.resolve(ConfigOverrideManager.BASE_FILE_NAME)
            conn.inputStream.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_NAME, name)
                .putString(KEY_URL, urlString)
                .putString(KEY_SUB, json.encodeToString(sub))
                .putLong(KEY_UPDATE_TIME, System.currentTimeMillis())
                .putInt(KEY_INTERVAL, intervalHours)
                .apply()
            
            ClashState.setLastUpdateTime(System.currentTimeMillis())

            // base.yaml is fresh on disk — produce config.yaml from it (applying
            // any currently-enabled overrides) so the core sees a complete file.
            ConfigOverrideManager.rebuild(context)

            // Ask the core to load the new config so the UI (ProxiesTab) and service are up to date
            reloadAndReapplySelections(context)

            if (intervalHours > 0) {
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val previous = prefs.getLong(KEY_INTERVAL_KEEP, -1L)
                val policy = if (previous == intervalHours.toLong()) {
                    androidx.work.ExistingPeriodicWorkPolicy.KEEP
                } else {
                    androidx.work.ExistingPeriodicWorkPolicy.UPDATE
                }
                scheduleUpdate(context, intervalHours.toLong(), policy)
            } else {
                cancelUpdate(context)
            }

            ClashState.setSubscription(sub)
            return name
        } finally {
            conn.disconnect()
        }
    }

    fun currentName(context: Context): String? {
        val name = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_NAME, null) ?: return null
        return if (hasConfig(context)) name else null
    }

    fun lastUrl(context: Context): String? {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_URL, null)
    }

    fun loadSubscription(context: Context): SubscriptionInfo? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SUB, null) ?: return null
        return runCatching { json.decodeFromString<SubscriptionInfo>(raw) }.getOrNull()
    }

    fun saveSubscription(context: Context, sub: SubscriptionInfo) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SUB, json.encodeToString(sub))
            .apply()
    }

    fun hasConfig(context: Context): Boolean {
        return context.filesDir.resolve("clash/$FILE_NAME").exists()
    }

    fun lastUpdateTime(context: Context): Long {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_UPDATE_TIME, 0L)
    }

    private const val WORK_NAME = "config_update"
    private const val KEY_INTERVAL_KEEP = "scheduled_interval"

    private fun scheduleUpdate(
        context: Context,
        hours: Long,
        policy: androidx.work.ExistingPeriodicWorkPolicy = androidx.work.ExistingPeriodicWorkPolicy.KEEP
    ) {
        val workManager = androidx.work.WorkManager.getInstance(context)
        val request = androidx.work.PeriodicWorkRequestBuilder<ConfigUpdateWorker>(
            hours, java.util.concurrent.TimeUnit.HOURS
        )
            .setConstraints(
                androidx.work.Constraints.Builder()
                    .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                    .build()
            )
            .build()

        workManager.enqueueUniquePeriodicWork(WORK_NAME, policy, request)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putLong(KEY_INTERVAL_KEEP, hours).apply()
    }

    /**
     * Tells the core to reload config.yaml from the standard `clash/` directory,
     * waits briefly for the load to complete, then replays user-saved selector
     * choices on top of the freshly loaded groups. Shared between `importFromUrl`
     * and `ConfigOverrideManager.setEnabled`.
     */
    suspend fun reloadAndReapplySelections(context: Context) {
        val clashHome = context.filesDir.resolve("clash")
        runCatching {
            ClashRemoteManager.loadConfig(clashHome.absolutePath)
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

    /**
     * Registers ConfigUpdateWorker if it should be running (subscription URL exists
     * and interval > 0) but is not currently in WorkManager. Safe to call at app
     * start — if the worker is already running, nothing changes.
     */
    fun ensureUpdateScheduled(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val intervalHours = prefs.getInt(KEY_INTERVAL, 0).toLong()
        if (intervalHours <= 0) return
        if (prefs.getString(KEY_URL, null).isNullOrBlank()) return
        scheduleUpdate(context, intervalHours, androidx.work.ExistingPeriodicWorkPolicy.KEEP)
    }

    private fun cancelUpdate(context: Context) {
        androidx.work.WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove(KEY_INTERVAL_KEEP).apply()
    }

    fun clearAll(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        clearSavedSelections(context)
        clearProxyGroupsCache(context)
        ConfigOverrideManager.clearPrefs(context)
        runCatching { context.filesDir.resolve("clash").deleteRecursively() }
        cancelUpdate(context)
        ClashState.setSubscription(null)
        ClashState.setLastUpdateTime(0L)
    }

    /**
     * Cache of the last successful proxyGroups snapshot. Needed so the Proxies
     * tab shows up-to-date groups from the last session during a cold start,
     * without waiting for the core's response (which loads in a separate
     * :vpn process and starts after the first connection).
     *
     * Serialized to JSON via kotlinx.serialization. Cache size is
     * proportional to the number of proxies — usually a few kilobytes.
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

    private fun parseFilename(header: String?): String? {
        if (header.isNullOrBlank()) return null
        val match = Regex("""filename\*?=(?:UTF-8'')?"?([^";]+)"?""", RegexOption.IGNORE_CASE).find(header)
        return match?.groupValues?.get(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun configFile(context: Context) = context.filesDir.resolve("clash/$FILE_NAME")

    fun readTunStack(context: Context): String? {
        val file = configFile(context)
        if (!file.exists()) return null
        return runCatching { extractTunField(file.readText(), "stack") }.getOrNull()
    }

    fun readFakeIpRange(context: Context): String? {
        val file = configFile(context)
        if (!file.exists()) return null
        return runCatching {
            val text = file.readText()
            val dnsBlock = extractTopBlock(text, "dns") ?: return@runCatching null
            Regex("""^\s*fake-ip-range\s*:\s*(\S+)\s*$""", RegexOption.MULTILINE)
                .find(dnsBlock)?.groupValues?.get(1)?.trim('"', '\'')
        }.getOrNull()
    }

    /**
     * Parses the `proxy-groups` block and returns a map: group name -> drawable resource name
     * from the `icon-cheezy` field (format `@drawable/foo` or just `foo`). The `icon`
     * field (URL to PNG) is currently ignored.
     */
    fun readGroupIcons(context: Context): Map<String, String> {
        val file = configFile(context)
        if (!file.exists()) {
            android.util.Log.w("GroupIcons", "Config file not found: ${file.absolutePath}")
            return emptyMap()
        }
        return runCatching {
            val text = file.readText()
            android.util.Log.d("GroupIcons", "Config size: ${text.length} chars")
            val block = extractTopBlock(text, "proxy-groups")
            if (block == null) {
                android.util.Log.w("GroupIcons", "proxy-groups block not found in YAML")
                return@runCatching emptyMap()
            }
            android.util.Log.d("GroupIcons", "proxy-groups block size: ${block.length} chars, first 200 chars: ${block.take(200)}")
            val parsed = parseProxyGroupIcons(block)
            android.util.Log.d("GroupIcons", "Parsed ${parsed.size} group→icon entries: $parsed")
            parsed
        }.onFailure {
            android.util.Log.e("GroupIcons", "Failed to read group icons", it)
        }.getOrDefault(emptyMap())
    }

    /**
     * Inside the `proxy-groups` block, finds each `- name: X` and looks for
     * `icon-cheezy: Y` below it within the same element (until the next `- name:`
     * with the same indentation). The resource name is cleaned of the `@drawable/` prefix.
     */
    private fun parseProxyGroupIcons(block: String): Map<String, String> {
        val result = LinkedHashMap<String, String>()
        val lines = block.lines()
        var groupsSeen = 0
        var idx = 0
        while (idx < lines.size) {
            val line = lines[idx]
            val nameMatch = Regex("""^(\s*)-\s*name\s*:\s*(.+)$""").find(line)
            if (nameMatch == null) { idx++; continue }
            groupsSeen++
            val itemIndent = nameMatch.groupValues[1].length
            val name = nameMatch.groupValues[2].trim().trim('"', '\'')
            var icon: String? = null
            var j = idx + 1
            while (j < lines.size) {
                val l = lines[j]
                if (l.isBlank()) { j++; continue }
                val nextItem = Regex("""^(\s*)-\s*name\s*:""").find(l)
                if (nextItem != null && nextItem.groupValues[1].length <= itemIndent) break
                val iconMatch = Regex("""^\s*icon-cheezy\s*:\s*(.+)$""").find(l)
                if (iconMatch != null) {
                    val raw = iconMatch.groupValues[1].trim().trim('"', '\'')
                    icon = raw.removePrefix("@drawable/").takeIf { it.isNotBlank() }
                    android.util.Log.d("GroupIcons", "Group '$name': icon-cheezy raw='$raw' → resName='$icon'")
                    break
                }
                j++
            }
            if (icon == null) android.util.Log.d("GroupIcons", "Group '$name': no icon-cheezy field found")
            if (icon != null && name.isNotEmpty()) result[name] = icon
            idx++
        }
        android.util.Log.d("GroupIcons", "Total groups seen=$groupsSeen, with icon=${result.size}")
        return result
    }

    fun readExcludePackages(context: Context): List<String> {
        val file = configFile(context)
        if (!file.exists()) return emptyList()
        return runCatching {
            val tun = extractTopBlock(file.readText(), "tun") ?: return@runCatching emptyList()
            parseStringList(tun, "exclude-package")
        }.getOrDefault(emptyList())
    }

    private fun extractTunField(yaml: String, field: String): String? {
        val tun = extractTopBlock(yaml, "tun") ?: return null
        return Regex("""^\s*$field\s*:\s*(\S+)\s*$""", RegexOption.MULTILINE)
            .find(tun)?.groupValues?.get(1)?.trim('"', '\'')
    }

    /** Returns the text of the top-level block (by indentation) for the key `key:`. */
    private fun extractTopBlock(yaml: String, key: String): String? {
        val lines = yaml.lines()
        val headerIdx = lines.indexOfFirst { Regex("""^$key\s*:\s*$""").matches(it) }
        if (headerIdx < 0) return null
        val sb = StringBuilder()
        for (i in (headerIdx + 1) until lines.size) {
            val line = lines[i]
            if (line.isBlank()) { sb.appendLine(line); continue }
            // End of block - line without indentation
            if (!line.startsWith(" ") && !line.startsWith("\t")) break
            sb.appendLine(line)
        }
        return sb.toString()
    }

    /** Parses a YAML string list in both formats: flow [a, b] and block - a / - b. */
    private fun parseStringList(block: String, key: String): List<String> {
        val keyLine = Regex("""^(\s*)$key\s*:\s*(.*)$""", RegexOption.MULTILINE).find(block) ?: return emptyList()
        val baseIndent = keyLine.groupValues[1].length
        val rest = keyLine.groupValues[2].trim()

        // Inline flow format: [a, b, c] (possibly multi-line)
        if (rest.startsWith("[")) {
            val sb = StringBuilder(rest)
            val keyEnd = keyLine.range.last + 1
            if (!rest.contains(']')) {
                val tail = block.substring(keyEnd)
                val closeIdx = tail.indexOf(']')
                if (closeIdx >= 0) sb.append(tail.substring(0, closeIdx + 1))
            }
            val flow = sb.toString().substringAfter('[').substringBeforeLast(']')
            return flow.split(',')
                .map { it.trim().trim('"', '\'') }
                .filter { it.isNotEmpty() }
        }

        // Block format: next lines with indentation > baseIndent and starting with "- "
        val keyEnd = keyLine.range.last + 1
        val tail = block.substring(keyEnd).lines()
        val items = mutableListOf<String>()
        for (line in tail) {
            if (line.isBlank()) continue
            val indent = line.takeWhile { it == ' ' || it == '\t' }.length
            if (indent <= baseIndent) break
            val trimmed = line.trimStart()
            if (!trimmed.startsWith("-")) break
            val v = trimmed.removePrefix("-").trim().trim('"', '\'')
            if (v.isNotEmpty()) items.add(v)
        }
        return items
    }

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
