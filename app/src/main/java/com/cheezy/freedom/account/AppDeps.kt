package com.cheezy.freedom.account

object AppDeps {
    lateinit var accountProvider: AccountProvider
        private set

    lateinit var subscriptionGateway: SubscriptionGateway
        private set

    lateinit var launchers: AppLaunchers
        private set

    fun install(
        accountProvider: AccountProvider,
        subscriptionGateway: SubscriptionGateway,
        launchers: AppLaunchers,
    ) {
        this.accountProvider = accountProvider
        this.subscriptionGateway = subscriptionGateway
        this.launchers = launchers
    }
}
