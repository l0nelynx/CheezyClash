package com.cheezy.freedom.clash

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Serialize complete profile transactions, including network awaits and core application. */
internal object ProfileOperations {
    private val mutex = Mutex()
    suspend fun <T> run(block: suspend () -> T): T = withContext(Dispatchers.IO) { mutex.withLock { block() } }
}
