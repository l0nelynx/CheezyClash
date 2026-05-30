package com.cheezy.freedom.account

/**
 * Snapshot of server-side subscription information. Populated by the proprietary
 * provider from the /me response. In the open version, it is always null — all
 * the same information already comes in the headers of the subscription URL
 * response (subscription-userinfo, profile-title) and is parsed inside
 * ConfigManager.importFromUrl → SubscriptionInfo, without snapshot involvement.
 *
 * All volumes are in BYTES, expire is in UNIX seconds (same as in
 * SubscriptionInfo.expire and formatExpire(unix)).
 */
data class SubscriptionSnapshot(
    val tariff: String?,
    val usedBytes: Long,
    val totalBytes: Long,
    val expireEpochSeconds: Long,
    val emailVerified: Boolean,
)

sealed interface AccountState {
    object Unknown : AccountState
    object Anonymous : AccountState
    data class Authenticated(
        val email: String?,
        val telegramId: Long?,
        val snapshot: SubscriptionSnapshot?,
    ) : AccountState
}
