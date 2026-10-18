package com.cheezy.freedom.clash

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test

class VpnCommandQueueTest {
    @Test fun `restart waits for teardown acknowledgement and preserves click order`() = runBlocking {
        val queue = VpnCommandQueue()
        val stopAccepted = CompletableDeferred<Unit>()
        val stopped = CompletableDeferred<Unit>()
        val events = mutableListOf<String>()
        val stop = launch {
            queue.run {
                events += "stop requested"
                stopAccepted.complete(Unit)
                stopped.await()
                events += "resources closed"
            }
        }
        stopAccepted.await()
        val start = launch { queue.run { events += "start" } }
        val secondStop = launch { queue.run { events += "second stop" } }
        yield()
        assertEquals(listOf("stop requested"), events)
        stopped.complete(Unit)
        joinAll(stop, start, secondStop)
        assertEquals(listOf("stop requested", "resources closed", "start", "second stop"), events)
    }

    @Test fun `cancelled waiter cannot start VPN and failed command releases queue`() = runBlocking {
        val queue = VpnCommandQueue()
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val stop = launch { queue.run { entered.complete(Unit); release.await() } }
        entered.await()
        val start = launch { queue.run { fail("Cancelled start executed") } }
        yield()
        start.cancelAndJoin()
        release.complete(Unit)
        stop.join()
        assertTrue(runCatching { queue.run { error("Binder disconnected") } }.isFailure)
        var delivered = false
        queue.run { delivered = true }
        assertTrue(delivered)
    }
}
