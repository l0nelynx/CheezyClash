package com.cheezy.freedom.account

import android.content.Context
import kotlinx.coroutines.flow.StateFlow

interface AccountProvider {
    val state: StateFlow<AccountState>

    val supportsAuthFlow: Boolean
    val supportsBilling: Boolean
    val supportsTelegramLink: Boolean
    val supportsDeviceManagement: Boolean

    /**
     * Whether the user may manage multiple subscription profiles (add/switch/
     * delete). Open flavor = true. Proprietary = false: it shows a single
     * backend-managed profile pinned first, non-deletable. Default false so the
     * proprietary provider needn't override it.
     */
    val supportsMultipleProfiles: Boolean get() = false

    suspend fun bootstrap(context: Context)

    suspend fun signOut(context: Context): Result<Unit>

    suspend fun startTelegramLink(context: Context): Result<TelegramLinkInfo> =
        Result.failure(UnsupportedOperationException("Telegram link not supported"))

    suspend fun linkByUrl(context: Context, url: String, email: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("Telegram link not supported"))

    suspend fun unlinkTelegram(context: Context): Result<Unit> =
        Result.failure(UnsupportedOperationException("Telegram link not supported"))
}

data class TelegramLinkInfo(
    val deeplink: String,
    val expiresAt: Long,
)
