package com.cheezy.freedom.clash

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** A later start must wait for the previous stop's teardown acknowledgement. */
internal class VpnCommandQueue {
    private val mutex = Mutex()

    suspend fun run(command: suspend () -> Unit) = mutex.withLock { command() }
}
