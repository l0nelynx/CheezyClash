package com.cheezy.freedom.clash

import kotlinx.serialization.Serializable

@Serializable
data class SubscriptionInfo(
    val title: String? = null,
    val announce: String? = null,
    val upload: Long = 0,
    val download: Long = 0,
    val total: Long = 0,
    val expire: Long = 0,
    val tag: String? = null,
)
