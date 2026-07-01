package com.cheezy.freedom.clash

import kotlinx.serialization.Serializable

/**
 * A single subscription profile. The app keeps a catalog of these
 * ([ProfileStore]); exactly one is active at a time and its directory
 * (`filesDir/profiles/<id>/`) is what the mihomo core loads.
 *
 * [managed] marks a profile that is owned by the backend (proprietary API
 * subscription): it is pinned first, highlighted, and cannot be deleted by the
 * user. In the open flavor all profiles are user-owned ([managed] == false).
 */
@Serializable
data class Profile(
    val id: String,
    val name: String,
    val url: String? = null,
    val subscription: SubscriptionInfo? = null,
    val lastUpdateTime: Long = 0L,
    val updateIntervalHours: Int = 0,
    val managed: Boolean = false,
    /** Monotonic insertion order, used to keep the list stable across edits. */
    val order: Long = 0L,
)
