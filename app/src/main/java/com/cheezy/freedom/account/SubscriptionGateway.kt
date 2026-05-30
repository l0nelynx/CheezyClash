package com.cheezy.freedom.account

import android.content.Context

interface SubscriptionGateway {
    suspend fun syncFromBackend(context: Context): Result<Unit>

    suspend fun importByUrl(context: Context, url: String): Result<String>
}
