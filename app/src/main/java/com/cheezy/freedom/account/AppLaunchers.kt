package com.cheezy.freedom.account

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable

interface AppLaunchers {
    fun authActivityIntent(context: Context): Intent?
    fun subscriptionActivityIntent(context: Context): Intent?
    fun devicesActivityIntent(context: Context): Intent?

    /**
     * Handles a `cheezy://login/<payload>` deep link. Returns an Intent to launch
     * (proprietary, once the backend is wired) or null when unsupported (open, or
     * not yet implemented) — in which case the link is silently ignored. Default
     * null so the open launcher needn't override it and the routing is ready for
     * the proprietary side to fill in later.
     */
    fun loginDeepLinkIntent(context: Context, payload: String): Intent? = null

    /**
     * Composable-слот для диалога переноса подписки (Telegram/email-URL).
     * Open-вариант возвращает null — диалога нет, кнопки тоже нет (см. capabilities).
     * Proprietary возвращает обёртку над TransferSubscriptionDialog.
     */
    val TransferSubscriptionDialog: (@Composable (
        isLoading: Boolean,
        onDismiss: () -> Unit,
        onLinkTelegram: () -> Unit,
        onLinkByUrl: (String, String) -> Unit,
    ) -> Unit)?

    /**
     * Composable-слот для дополнительных пунктов в настройках.
     * Позволяет флаворам добавлять свои ListItem (например, "Add configuration").
     */
    val ExtraSettingsItems: @Composable (onAddConfig: () -> Unit) -> Unit
}
