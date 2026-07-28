package com.cheezy.freedom.ui.main.proxies

import androidx.compose.runtime.Immutable
import com.github.kr328.clash.core.model.Proxy
import com.github.kr328.clash.core.model.ProxyGroup

@Immutable
data class PrimaryProxyGroupUiData(
    val name: String,
    val now: String,
    val proxies: List<ProxyUiData>,
)

internal data class ProxyRuntimeSnapshot(
    val requestedNames: List<String>,
    val groups: List<Pair<String, List<ProxyUiData>>>,
    val primarySelector: PrimaryProxyGroupUiData?,
    val delays: Map<String, Map<String, Int>>,
)

internal fun buildProxyRuntimeSnapshot(
    groupNames: List<String>,
    groupMap: Map<String, ProxyGroup>,
): ProxyRuntimeSnapshot {
    val groups = groupNames.mapNotNull { name ->
        val group = groupMap[name] ?: return@mapNotNull null
        name to group.proxies.map { proxy -> proxy.toUiData(group, groupMap) }
    }

    val delays = groupMap.mapValues { (_, group) ->
        group.proxies.mapNotNull { proxy ->
            proxy.uiDelayOrNull()?.let { proxy.name to it }
        }.toMap()
    }

    val primarySelector = groupNames.firstNotNullOfOrNull { name ->
        val group = groupMap[name] ?: return@firstNotNullOfOrNull null
        if (group.type != Proxy.Type.Selector) return@firstNotNullOfOrNull null
        PrimaryProxyGroupUiData(
            name = name,
            now = group.now,
            proxies = group.proxies.map { proxy -> proxy.toUiData(group, groupMap) },
        )
    }

    return ProxyRuntimeSnapshot(
        requestedNames = groupNames,
        groups = groups,
        primarySelector = primarySelector,
        delays = delays,
    )
}

internal fun mergeProxyDelays(
    previous: Map<String, Map<String, Int>>,
    snapshot: ProxyRuntimeSnapshot,
    replaceGroups: Boolean,
): Map<String, Map<String, Int>> {
    val requested = snapshot.requestedNames.toSet()
    return (if (replaceGroups) emptyMap() else previous)
        .filterKeys { it in requested }
        .toMutableMap()
        .apply { putAll(snapshot.delays) }
}

fun proxyDelay(
    groupName: String,
    proxy: ProxyUiData,
    delays: Map<String, Map<String, Int>>,
): Int? {
    val delayGroup = proxy.activeChild?.let { proxy.name } ?: groupName
    val delayName = proxy.activeChild ?: proxy.name
    return delays[delayGroup]?.get(delayName)
        ?: delays[groupName]?.get(proxy.name)
}

private fun Proxy.toUiData(
    parent: ProxyGroup,
    allGroups: Map<String, ProxyGroup>,
): ProxyUiData {
    val typeName = type.name
    val activeChild = if (typeName.isSubgroupType()) {
        val subgroup = allGroups[name]
        subgroup?.now?.takeIf { it.isNotBlank() }
            ?: if (typeName == "URLTest" || typeName == "Fallback" || typeName == "Smart") {
                subgroup?.proxies?.firstOrNull()?.name
            } else {
                null
            }
    } else {
        null
    }

    return ProxyUiData(
        name = name,
        type = typeName,
        subtitle = subtitle,
        groupNow = parent.now,
        activeChild = activeChild,
    )
}

private fun Proxy.uiDelayOrNull(): Int? = when {
    !delayAvailable -> null
    delay in 1 until 65535 -> delay
    else -> -1
}
