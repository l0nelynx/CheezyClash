package com.cheezy.freedom.account.internal

import android.content.Context
import com.cheezy.freedom.account.AccountProvider
import com.cheezy.freedom.account.AccountState
import com.cheezy.freedom.account.TelegramLinkInfo
import com.cheezy.freedom.clash.ConfigManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Open version of the account provider: no backend, any subscription is valid,
 * no email/Telegram is tracked. Used in the open flavor and as a fallback
 * in the current build until the proprietary initializer is launched
 * (see AppDepsInitializer).
 */
class OpenAccountProvider : AccountProvider {
    private val _state = MutableStateFlow<AccountState>(AccountState.Anonymous)
    override val state: StateFlow<AccountState> = _state.asStateFlow()

    override val supportsAuthFlow: Boolean = false
    override val supportsBilling: Boolean = false
    override val supportsTelegramLink: Boolean = false
    override val supportsDeviceManagement: Boolean = false

    override suspend fun bootstrap(context: Context) {
        // Nothing to restore — in the open flow, the state is always Anonymous.
    }

    override suspend fun signOut(context: Context): Result<Unit> = runCatching {
        ConfigManager.clearAll(context)
    }
}
