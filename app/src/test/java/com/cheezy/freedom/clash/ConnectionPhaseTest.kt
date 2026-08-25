package com.cheezy.freedom.clash

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionPhaseTest {
    @Test
    fun `stopping is busy until native teardown completes`() {
        assertTrue(ConnectionPhase.STOPPING.isBusy)
        assertFalse(ConnectionPhase.IDLE.isBusy)
        assertFalse(ConnectionPhase.CONNECTED.isBusy)
        assertFalse(ConnectionPhase.ERROR.isBusy)
    }
}
