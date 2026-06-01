package com.cheezy.freedom.ui.main.dialogs

data class ShareVpnInfo(
    val mixedPort: Int?,
    val httpPort: Int?,
    val socksPort: Int?,
    val localProxyEnabled: Boolean,
    val localProxyForcedByBase: Boolean,
) {
    companion object {
        val EMPTY = ShareVpnInfo(
            mixedPort = null,
            httpPort = null,
            socksPort = null,
            localProxyEnabled = false,
            localProxyForcedByBase = false,
        )
    }
}
