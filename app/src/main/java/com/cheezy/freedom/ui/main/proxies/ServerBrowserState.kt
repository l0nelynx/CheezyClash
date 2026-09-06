package com.cheezy.freedom.ui.main.proxies

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateMapOf

enum class ServerSort { PROFILE, NAME, LATENCY }
class ServerBrowserState {
    var query by mutableStateOf("")
    var sort by mutableStateOf(ServerSort.PROFILE)
    val expanded = mutableStateMapOf<String, Boolean>()
    val scroll = LazyListState()
}

internal fun browseServers(proxies: List<ProxyUiData>, query: String, sort: ServerSort, delays: Map<String, Int>): List<ProxyUiData> {
    val filtered = proxies.filter { it.name.contains(query.trim(), ignoreCase = true) }
    return when (sort) {
        ServerSort.PROFILE -> filtered
        ServerSort.NAME -> filtered.sortedBy { it.name.lowercase() }
        ServerSort.LATENCY -> filtered.sortedWith(compareBy<ProxyUiData> {
            delays[it.name]?.takeIf { delay -> delay in 1..65534 } ?: Int.MAX_VALUE
        }.thenBy { it.name.lowercase() })
    }
}
