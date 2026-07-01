package com.cheezy.freedom.account.internal

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import com.cheezy.freedom.account.AppLaunchers

/**
 * Open version of launchers: none of the proprietary Activities exist,
 * all methods return null. MainScreen sees null and skips the
 * corresponding flow (e.g., for needsAuth, it shows UrlDialog
 * instead of AuthActivity).
 */
class OpenAppLaunchers : AppLaunchers {
    override fun authActivityIntent(context: Context): Intent? = null
    override fun subscriptionActivityIntent(context: Context): Intent? = null
    override fun devicesActivityIntent(context: Context): Intent? = null

    // In the open version, there is no subscription transfer; the dialog does not exist.
    override val TransferSubscriptionDialog = null

    // Adding subscriptions now lives on the Profiles tab, so Settings has no
    // extra "add configuration" item in the open flavor.
    override val ExtraSettingsItems: @Composable (onAddConfig: () -> Unit) -> Unit = { }
}
