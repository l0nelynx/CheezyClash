package com.cheezy.freedom.account.internal

import android.content.Context
import com.cheezy.freedom.account.SubscriptionGateway
import com.cheezy.freedom.clash.ConfigManager

/**
 * Open-вариант шлюза подписки: бэкенда нет, sync — no-op, импорт идёт прямо в
 * ConfigManager БЕЗ валидатора заголовков (любой clash YAML принимается).
 */
class OpenSubscriptionGateway : SubscriptionGateway {
    override suspend fun syncFromBackend(context: Context): Result<Unit> = Result.success(Unit)

    override suspend fun importByUrl(context: Context, url: String): Result<String> = runCatching {
        ConfigManager.importFromUrl(context, url)
    }
}
