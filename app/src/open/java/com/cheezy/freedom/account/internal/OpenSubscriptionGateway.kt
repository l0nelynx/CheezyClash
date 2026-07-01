package com.cheezy.freedom.account.internal

import android.content.Context
import com.cheezy.freedom.account.SubscriptionGateway
import com.cheezy.freedom.clash.ProfileManager
import com.cheezy.freedom.clash.ProfileStore

/**
 * Open-вариант шлюза подписки: бэкенда нет, sync — no-op. Импорт идёт через
 * ProfileManager БЕЗ валидатора заголовков (любой clash YAML принимается).
 */
class OpenSubscriptionGateway : SubscriptionGateway {
    override suspend fun syncFromBackend(context: Context): Result<Unit> = Result.success(Unit)

    /** Добавляет новую подписку как отдельный профиль и делает её активной. */
    override suspend fun addProfile(context: Context, url: String): Result<String> = runCatching {
        ProfileManager.importNew(context, url).name
    }

    /**
     * Обновляет профиль с таким URL, если он уже есть; иначе добавляет новый.
     * (Используется legacy-путями refresh/worker.)
     */
    override suspend fun importByUrl(context: Context, url: String): Result<String> = runCatching {
        val existing = ProfileStore.list(context).firstOrNull { it.url == url }
        if (existing != null) {
            ProfileManager.refreshProfile(context, existing.id).getOrThrow()
            ProfileStore.get(context, existing.id)?.name ?: existing.name
        } else {
            ProfileManager.importNew(context, url).name
        }
    }
}
