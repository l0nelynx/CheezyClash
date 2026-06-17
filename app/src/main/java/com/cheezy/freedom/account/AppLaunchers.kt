package com.cheezy.freedom.account

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable

interface AppLaunchers {
    fun authActivityIntent(context: Context): Intent?
    fun subscriptionActivityIntent(context: Context): Intent?
    fun devicesActivityIntent(context: Context): Intent?

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
