package com.cheezy.freedom.clash

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test

/** Run on a test installation with VPN disconnected; no tunnel or Activity is started. */
class VpnServiceControlTest {
    @Test fun stopFromBackgroundReconcilesStaleStateAndReleasesBinding() = runBlocking {
        withContext(Dispatchers.Main.immediate) {
            assertFalse(ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
        }
        assertFalse(ClashRemoteManager.isRunningChecked())
        // Reproduce the Activity's last snapshot outliving the actual VPN.
        ClashState.setRunning(true)
        ClashState.setPhase(ConnectionPhase.CONNECTED)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        withTimeout(15_000) { ClashRemoteManager.requestStop(context).join() }
        assertFalse(ClashState.running.value)
        assertEquals(ConnectionPhase.IDLE, ClashState.phase.value)
        assertFalse(ClashRemoteManager.connected.value)
        // A second stop must also succeed when the service is already stopped.
        withTimeout(15_000) { ClashRemoteManager.requestStop(context).join() }
        assertFalse(ClashState.running.value)
        assertFalse(ClashRemoteManager.connected.value)
    }

    @Test fun releasingOneClientKeepsOtherClientConnected() = runBlocking {
        withContext(Dispatchers.Main.immediate) {
            val tile = ClashRemoteManager.acquireConnection()
            val command = ClashRemoteManager.acquireConnection()
            try {
                withTimeout(10_000) { ClashRemoteManager.connected.first { it } }
                tile.close()
                tile.close() // Lifecycle callbacks may release the same handle twice.
                assertTrue(ClashRemoteManager.connected.value)
                ClashRemoteManager.stopVpn()
                assertTrue(ClashRemoteManager.connected.value)
            } finally {
                tile.close()
                command.close()
            }
            assertFalse(ClashRemoteManager.connected.value)
        }
    }
}
