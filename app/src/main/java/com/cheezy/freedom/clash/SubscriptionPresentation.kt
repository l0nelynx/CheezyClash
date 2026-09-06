package com.cheezy.freedom.clash

import com.cheezy.freedom.account.SubscriptionSnapshot

/** Account totals apply only to the primary account profile, never an imported URL. */
internal fun subscriptionForProfile(profile: Profile?, snapshot: SubscriptionSnapshot?): SubscriptionInfo? {
    profile ?: return null
    val source = profile.subscription
    if (!profile.managed || profile.managedKey !in listOf(null, "primary") || snapshot == null) return source
    return (source ?: SubscriptionInfo()).copy(
        title = source?.title ?: snapshot.tariff,
        upload = snapshot.usedBytes / 2,
        download = snapshot.usedBytes - snapshot.usedBytes / 2,
        total = snapshot.totalBytes,
        expire = snapshot.expireEpochSeconds,
    )
}
