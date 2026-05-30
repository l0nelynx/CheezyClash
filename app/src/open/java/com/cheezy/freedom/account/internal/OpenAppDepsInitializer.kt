package com.cheezy.freedom.account.internal

import android.content.Context
import androidx.startup.Initializer
import com.cheezy.freedom.account.AppDeps

/**
 * Регистрирует open-варианты провайдеров в AppDeps. В proprietary flavor существует
 * CheezyAppDepsInitializer, который объявляет dependencies = [OpenAppDepsInitializer]
 * и выполняется ПОСЛЕ нас — его install() перетирает наши open-default'ы.
 *
 * Таким образом main-код может в любой момент после Application.onCreate обращаться
 * к AppDeps.* без знания о том, какой flavor собран.
 */
class OpenAppDepsInitializer : Initializer<AppDeps> {
    override fun create(context: Context): AppDeps {
        AppDeps.install(
            accountProvider = OpenAccountProvider(),
            subscriptionGateway = OpenSubscriptionGateway(),
            launchers = OpenAppLaunchers(),
        )
        return AppDeps
    }

    override fun dependencies(): List<Class<out Initializer<*>>> = emptyList()
}
