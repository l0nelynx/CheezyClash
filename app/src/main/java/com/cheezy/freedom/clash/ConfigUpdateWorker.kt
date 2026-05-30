package com.cheezy.freedom.clash

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.cheezy.freedom.account.AppDeps
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ConfigUpdateWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // First, try to update profile info and URL via the subscription gateway.
        // In proprietary, this triggers /me and automatically redownloads YAML if the
        // URL changed; in open, this is a no-op — we just proceed to the saved URL below.
        AppDeps.subscriptionGateway.syncFromBackend(applicationContext)

        // Get the current URL (it might have been updated above)
        val url = ConfigManager.lastUrl(applicationContext) ?: return@withContext Result.failure()

        runCatching {
            // If syncFromBackend did not trigger an import (URL didn't change / no
            // backend), forcibly update the config content from the current URL via
            // the gateway — in proprietary, this attaches Cheezy header validators;
            // in open, it doesn't.
            AppDeps.subscriptionGateway.importByUrl(applicationContext, url).getOrThrow()
        }.fold(
            onSuccess = { Result.success() },
            onFailure = { Result.retry() }
        )
    }
}
