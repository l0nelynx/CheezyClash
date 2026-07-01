package com.cheezy.freedom.clash

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.cheezy.freedom.account.AppDeps
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Periodic background refresh of ALL profiles (not just the active one). A single
 * unique-periodic work fires on the smallest per-profile interval; each firing
 * refreshes every profile whose own interval is due. One profile failing does
 * not abort the rest.
 */
class ConfigUpdateWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        ProfileManager.migrateLegacyIfNeeded(ctx)

        // Managed (backend-owned) profile is refreshed by the gateway sync
        // (proprietary re-fetches /me and re-imports; open is a no-op).
        AppDeps.subscriptionGateway.syncFromBackend(ctx)

        val now = System.currentTimeMillis()
        var anyFailure = false

        ProfileStore.list(ctx).forEach { profile ->
            if (profile.managed) return@forEach          // handled by syncFromBackend
            val url = profile.url ?: return@forEach
            val intervalMs = profile.updateIntervalHours.toLong() * 3_600_000L
            val due = intervalMs > 0 && now - profile.lastUpdateTime >= intervalMs
            if (!due) return@forEach
            ProfileManager.refreshProfile(ctx, profile.id).onFailure { anyFailure = true }
        }

        if (anyFailure) Result.retry() else Result.success()
    }
}
