package com.cheezy.freedom.clash

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class ProfileOperationsTest {
    @Test fun `delete waits for refresh commit and cannot be undone by its result`() = runBlocking {
        val downloaded = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val catalog = mutableSetOf("profile")
        val refresh = launch {
            ProfileOperations.run {
                downloaded.complete(Unit)
                release.await()
                catalog.add("profile")
            }
        }
        downloaded.await()
        val remove = launch { ProfileOperations.run { catalog.remove("profile") } }
        yield()
        assertFalse(remove.isCompleted)
        release.complete(Unit)
        joinAll(refresh, remove)
        assertTrue(catalog.isEmpty())
    }

    @Test fun `failed operation and cancelled waiter do not poison the queue`() = runBlocking {
        runCatching { ProfileOperations.run { error("download failed") } }
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val first = launch { ProfileOperations.run { entered.complete(Unit); release.await() } }
        entered.await()
        val waiting = launch { ProfileOperations.run { fail("Cancelled operation executed") } }
        yield()
        waiting.cancelAndJoin()
        release.complete(Unit)
        first.join()
        assertEquals(42, ProfileOperations.run { 42 })
    }
}
