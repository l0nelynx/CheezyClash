package com.cheezy.freedom.clash

/**
 * Lifecycle of a connection attempt, reported from the :vpn process to the UI.
 *
 * The old model only had a binary `running` flag, so the UI faked a
 * "connecting" spinner with no real backing. These phases mark the actual
 * stages of [ClashVpnService.startClash] so the UI can show honest progress
 * and pin an error to the stage it happened on.
 */
enum class ConnectionPhase {
    /** Not running. */
    IDLE,

    /** Parsing config.yaml and building the core (proxies, providers, geodata). */
    LOADING,

    /** Creating the TUN interface via VpnService.Builder. */
    ESTABLISHING,

    /** TUN created, starting the tunnel loop. */
    STARTING,

    /** Tunnel is up and carrying traffic. */
    CONNECTED,

    /** The attempt failed; see [ClashState.lastError]. */
    ERROR;

    /** True while a start attempt is in flight (spinner states). */
    val isBusy: Boolean
        get() = this == LOADING || this == ESTABLISHING || this == STARTING
}
