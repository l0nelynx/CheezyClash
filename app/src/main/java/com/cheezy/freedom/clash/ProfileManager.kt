package com.cheezy.freedom.clash

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.io.File
import java.net.HttpURLConnection
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Operations layer over [ProfileStore]: importing, switching, refreshing and
 * removing profiles, plus the shared update-scheduling and legacy migration.
 *
 * A profile lives in its own directory (`filesDir/profiles/<id>/`). The core
 * always loads the *active* profile's directory; switching just points the core
 * at a different directory (and restarts the tunnel if it is running), while the
 * core HOME (`filesDir/clash/`) keeps shared static data (geodata, cache.db).
 */
object ProfileManager {
    /** Legacy id retained while an existing single managed profile is adopted. */
    const val MANAGED_ID = "managed-primary"

    private const val WORK_NAME = "config_update"
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun importNew(context: Context, url: String, validateHeaders: (HttpURLConnection) -> Unit = {}): Profile =
        ProfileOperations.run { importNewLocked(context, url, validateHeaders) }

    suspend fun upsertManaged(context: Context, url: String, managedKey: String = "primary", validateHeaders: (HttpURLConnection) -> Unit = {}): Profile =
        ProfileOperations.run { upsertManagedLocked(context, url, managedKey, validateHeaders) }

    suspend fun switchTo(context: Context, id: String, forceReload: Boolean = false) =
        ProfileOperations.run { switchToLocked(context, id, forceReload) }

    suspend fun refreshProfile(context: Context, id: String): Result<Unit> =
        ProfileOperations.run { refreshProfileLocked(context, id) }

    suspend fun remove(context: Context, id: String) = ProfileOperations.run { removeLocked(context, id) }

    suspend fun selectProxy(context: Context, expectedId: String?, group: String, proxy: String): Boolean = ProfileOperations.run {
        if (expectedId == null || ProfileStore.activeId(context) != expectedId) return@run false
        val dir = ProfileStore.dir(context, expectedId)
        if (PendingConfig.promote(dir)) {
            ConfigOverrideManager.rebuild(context, dir)
            try {
                ClashRemoteManager.loadConfigChecked(dir.absolutePath)
                ConfigManager.getSavedSelections(context).forEach { (name, selection) ->
                    ClashRemoteManager.patchSelector(name, selection)
                }
            } catch (error: Exception) {
                val pending = PendingConfig.directory(dir).apply { mkdirs() }.resolve("base.yaml")
                if (!pending.exists()) ConfigFiles.writeAtomically(pending, dir.resolve("base.yaml").readText())
                throw error
            }
        }
        ClashRemoteManager.patchSelector(group, proxy)
    }

    // --- Import ------------------------------------------------------------

    /**
     * Adds a user profile from [url] and makes it active. If a profile with the
     * same URL already exists it is refreshed and activated instead of creating a
     * duplicate.
     */
    private suspend fun importNewLocked(
        context: Context,
        url: String,
        validateHeaders: (HttpURLConnection) -> Unit = {},
    ): Profile {
        val duplicate = ProfileStore.list(context).firstOrNull { it.url == url }
        if (duplicate != null) {
            refreshProfileLocked(context, duplicate.id)
            switchToLocked(context, duplicate.id, forceReload = true)
            return ProfileStore.get(context, duplicate.id) ?: duplicate
        }

        val id = UUID.randomUUID().toString()
        val dir = ProfileStore.dir(context, id)
        val meta = ConfigManager.downloadBase(context, url, dir, validateHeaders)
        ConfigOverrideManager.rebuild(context, dir)

        val profile = Profile(
            id = id,
            name = meta.name,
            url = url,
            subscription = meta.subscription,
            lastUpdateTime = System.currentTimeMillis(),
            updateIntervalHours = meta.intervalHours,
            managed = false,
            order = ProfileStore.nextOrder(context),
        )
        ProfileStore.upsert(context, profile)
        ensureUpdateScheduled(context)
        switchToLocked(context, id, forceReload = true)
        return profile
    }

    /**
     * Proprietary entry point: upsert one backend-owned subscription using its
     * stable managed key. Does NOT steal focus from a user-chosen
     * profile — it only becomes active if nothing is active yet.
     */
    private suspend fun upsertManagedLocked(
        context: Context,
        url: String,
        managedKey: String = "primary",
        validateHeaders: (HttpURLConnection) -> Unit = {},
    ): Profile {
        val safeKey = managedKey.lowercase()
            .replace(Regex("[^a-z0-9_-]"), "-")
            .take(64)
            .ifBlank { "primary" }
        val existing = ProfileStore.list(context).firstOrNull { it.managedKey == managedKey }
            ?: ProfileStore.list(context).firstOrNull {
                it.id == MANAGED_ID && it.managedKey == null && it.url == url
            }
        val id = existing?.id ?: if (safeKey == "primary") MANAGED_ID else "managed-$safeKey"
        val dir = ProfileStore.dir(context, id)
        val deferred = currentCoroutineContext()[DeferProfileUpdates.Key] != null
        val targetDir = if (deferred) PendingConfig.directory(dir) else dir
        val meta = ConfigManager.downloadBase(context, url, targetDir, validateHeaders)
        if (!deferred) { ConfigOverrideManager.rebuild(context, dir); PendingConfig.discard(dir) }

        val profile = Profile(
            id = id,
            name = meta.name,
            url = url,
            subscription = meta.subscription,
            lastUpdateTime = System.currentTimeMillis(),
            updateIntervalHours = meta.intervalHours,
            managed = true,
            managedKey = managedKey,
            order = existing?.order ?: 0L,
        )
        ProfileStore.upsert(context, profile)
        ensureUpdateScheduled(context)

        when (ProfileStore.activeId(context)) {
            null -> if (deferred) ProfileStore.setActive(context, id) else switchToLocked(context, id, forceReload = true)
            id -> {
                ClashState.setSubscription(meta.subscription)
                ClashState.setLastUpdateTime(profile.lastUpdateTime)
                if (!deferred && ClashRemoteManager.isRunning()) {
                    ConfigManager.reloadAndReapplySelections(context, dir)
                }
            }
        }
        return profile
    }

    // --- Switch ------------------------------------------------------------

    /**
     * Makes [id] the active profile. Swaps the per-profile selection buckets and
     * reloads/restarts the core so it runs the new profile's config.
     */
    private suspend fun switchToLocked(context: Context, id: String, forceReload: Boolean = false) {
        requireNotNull(ProfileStore.get(context, id)) { "Profile no longer exists" }
        val current = ProfileStore.activeId(context)
        if (current == id && !forceReload) return

        if (current != null && current != id) ConfigManager.snapshotSelectionsTo(context, current)
        ProfileStore.setActive(context, id)
        if (current != id) ConfigManager.restoreSelectionsFrom(context, id)

        val profile = ProfileStore.get(context, id)
        ClashState.setSubscription(profile?.subscription)
        ClashState.setLastUpdateTime(profile?.lastUpdateTime ?: 0L)

        applyActive(context)
    }

    /**
     * Reloads the active profile into the core. When the VPN is running, the
     * tunnel is fully restarted so a new profile's providers/DNS/fake-ip take
     * effect (a hot reload could carry stale state). When stopped, the config is
     * reloaded into the bound core if connected, else picked up lazily on start.
     */
    private suspend fun applyActive(context: Context) {
        val dir = ProfileStore.activeDir(context)
        PendingConfig.promote(dir)
        // Overrides (e.g. Local Proxy / "Share VPN") are global state applied into a
        // profile's config.yaml only at rebuild time. Rebuild the now-active profile
        // so its config reflects the current override state before the core loads it.
        ConfigOverrideManager.rebuild(context, dir)
        if (ClashState.running.value) {
            ClashVpnService.stop(context)
            ClashVpnService.start(context)
        } else if (ClashRemoteManager.connected.value) {
            ConfigManager.reloadAndReapplySelections(context, dir)
        }
    }

    // --- Refresh -----------------------------------------------------------

    /** Re-downloads a single user profile's subscription into its own dir. */
    private suspend fun refreshProfileLocked(context: Context, id: String): Result<Unit> = runCatching {
        val profile = ProfileStore.get(context, id) ?: return@runCatching
        val url = profile.url ?: return@runCatching
        val dir = ProfileStore.dir(context, id)
        val deferred = currentCoroutineContext()[DeferProfileUpdates.Key] != null
        val targetDir = if (deferred) PendingConfig.directory(dir) else dir
        val meta = ConfigManager.downloadBase(context, url, targetDir)
        if (!deferred) { ConfigOverrideManager.rebuild(context, dir); PendingConfig.discard(dir) }

        ProfileStore.upsert(
            context,
            profile.copy(
                name = meta.name.ifBlank { profile.name },
                subscription = meta.subscription,
                lastUpdateTime = System.currentTimeMillis(),
                updateIntervalHours = meta.intervalHours,
            )
        )
        ensureUpdateScheduled(context)

        if (ProfileStore.activeId(context) == id) {
            ClashState.setSubscription(meta.subscription)
            ClashState.setLastUpdateTime(System.currentTimeMillis())
            if (!deferred && ClashRemoteManager.isRunning()) {
                ConfigManager.reloadAndReapplySelections(context, dir)
            }
        }
    }.onFailure { if (it is kotlinx.coroutines.CancellationException) throw it }

    /** Refreshes the currently active profile (no-op if none). */
    suspend fun refreshActive(context: Context): Result<Unit> {
        val id = ProfileStore.activeId(context) ?: return Result.success(Unit)
        return refreshProfile(context, id)
    }

    // --- Remove ------------------------------------------------------------

    private suspend fun removeLocked(context: Context, id: String) {
        val wasActive = ProfileStore.activeId(context) == id
        val newActive = ProfileStore.remove(context, id)
        if (wasActive) {
            if (newActive != null) {
                switchToLocked(context, newActive, forceReload = true)
            } else {
                ClashState.setSubscription(null)
                ClashState.setLastUpdateTime(0L)
                if (ClashState.running.value) ClashVpnService.stop(context)
            }
        }
        ensureUpdateScheduled(context)
    }

    // --- Update scheduling -------------------------------------------------

    /**
     * (Re)schedules the single periodic update worker. Cadence is the smallest
     * positive per-profile interval; if no profile has an interval, the worker
     * is cancelled. Safe to call after any list mutation.
     */
    fun ensureUpdateScheduled(context: Context) {
        val hours = ProfileStore.list(context)
            .mapNotNull { it.updateIntervalHours.takeIf { h -> h > 0 } }
            .minOrNull()
            ?.toLong()
        val wm = WorkManager.getInstance(context)
        if (hours == null) {
            wm.cancelUniqueWork(WORK_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<ConfigUpdateWorker>(hours, TimeUnit.HOURS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()
        wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    // --- Legacy migration --------------------------------------------------

    /**
     * One-time migration from the pre-multiprofile layout (single config in
     * `clash/` + `cheezy.config` prefs) into profile #1. Idempotent: guarded by
     * an empty catalog and clears the old prefs afterward. Runs in the main
     * process (moves files). No-op on a fresh install (no legacy config).
     */
    fun migrateLegacyIfNeeded(context: Context) {
        if (!ProfileStore.isEmpty(context)) return
        val legacy = context.filesDir.resolve("clash")
        if (!legacy.resolve("config.yaml").exists()) return

        val old = context.getSharedPreferences("cheezy.config", Context.MODE_PRIVATE)
        val name = old.getString("config_name", null) ?: "Subscription"
        val url = old.getString("config_url", null)
        val sub = old.getString("subscription_json", null)
            ?.let { runCatching { json.decodeFromString<SubscriptionInfo>(it) }.getOrNull() }
        val lastUpdate = old.getLong("last_update_time", 0L)
        val interval = old.getInt("update_interval", 0)

        val id = UUID.randomUUID().toString()
        val dir = ProfileStore.dir(context, id)
        // Move per-profile files; leave shared static (cache.db, geodata, override.json) in home.
        listOf("base.yaml", "config.yaml", "providers").forEach { entry ->
            moveInto(File(legacy, entry), File(dir, entry))
        }

        ProfileStore.upsert(
            context,
            Profile(
                id = id,
                name = name,
                url = url,
                subscription = sub,
                lastUpdateTime = lastUpdate,
                updateIntervalHours = interval,
                managed = false,
                order = 1L,
            )
        )
        ProfileStore.setActive(context, id)
        // The current global selections belong to this (only) profile.
        ConfigManager.snapshotSelectionsTo(context, id)
        old.edit().clear().apply()
        ensureUpdateScheduled(context)
    }

    private fun moveInto(src: File, dst: File) {
        if (!src.exists()) return
        runCatching {
            dst.parentFile?.mkdirs()
            if (!src.renameTo(dst)) {
                src.copyRecursively(dst, overwrite = true)
                src.deleteRecursively()
            }
        }
    }
}
