package com.cheezy.freedom.ui.main.proxies

import androidx.compose.runtime.Immutable
import kotlinx.serialization.Serializable

// @Serializable is needed to cache the group list to disk (ConfigManager.saveProxyGroupsCache),
// and show the Proxies tab during a cold start before the core responds.
@Immutable
@Serializable
data class ProxyUiData(
    val name: String,
    val type: String,
    val subtitle: String,
    val groupNow: String,
    val activeChild: String? = null
)

private val SUBGROUP_TYPES = setOf("URLTest", "Fallback", "LoadBalance", "Selector", "Smart")

fun String.isSubgroupType(): Boolean = this in SUBGROUP_TYPES

// In Compose, @Immutable on a sealed class is not propagated to data class subclasses
// — for skippable composables, annotations are needed on specific types.
@Immutable
sealed class ProxyListItem {
    @Immutable
    data class Header(
        val name: String,
        val type: String,
        val proxiesCount: Int,
        val currentProxy: String,
        val isExpanded: Boolean,
        val iconResId: Int = 0
    ) : ProxyListItem()

    @Immutable
    data class ProxyItem(
        val groupName: String,
        val name: String,
        val type: String,
        val subtitle: String,
        val pingMs: Int?,
        val isSelected: Boolean
    ) : ProxyListItem()

    @Immutable
    data class Divider(val id: String) : ProxyListItem()
}
