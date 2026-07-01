package com.cheezy.freedom.account

import android.content.Context

interface SubscriptionGateway {
    suspend fun syncFromBackend(context: Context): Result<Unit>

    /** Imports/refreshes the subscription identified by [url] (legacy single-config path). */
    suspend fun importByUrl(context: Context, url: String): Result<String>

    /**
     * Adds [url] as a NEW profile in the catalog and makes it active. Default
     * delegates to [importByUrl] so flavors that don't support multiple profiles
     * (proprietary) keep their single-config behavior without overriding.
     * Returns the imported profile's display name.
     */
    suspend fun addProfile(context: Context, url: String): Result<String> = importByUrl(context, url)
}
