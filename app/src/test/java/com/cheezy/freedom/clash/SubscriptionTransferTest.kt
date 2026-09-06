package com.cheezy.freedom.clash

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class SubscriptionTransferTest {
    @Test fun `unknown-length body cannot exceed cap`() {
        val output = ByteArrayOutputStream()
        assertTrue(runCatching { SubscriptionTransfer.copyLimited(ByteArrayInputStream(ByteArray(99)), output, 16) }.isFailure)
        assertEquals(0, output.size())
    }
    @Test fun `cancellation disconnects a blocked transfer`() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val released = CountDownLatch(1)
        val connection = object : HttpURLConnection(URL("https://example.invalid")) {
            override fun connect() = Unit
            override fun usingProxy() = false
            override fun disconnect() { released.countDown() }
        }
        val job = launch {
            SubscriptionTransfer.read(connection) { checkActive ->
                entered.complete(Unit)
                assertTrue(released.await(3, TimeUnit.SECONDS))
                checkActive()
            }
        }
        entered.await()
        job.cancelAndJoin()
        assertEquals(0L, released.count)
    }
}
