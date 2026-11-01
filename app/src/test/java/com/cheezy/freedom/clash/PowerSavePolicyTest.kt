package com.cheezy.freedom.clash

import com.github.kr328.clash.core.model.PowerSaveMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PowerSavePolicyTest {
    @Test fun `screen and Doze transitions restore the appropriate mode`() {
        val states = listOf(
            true to false,   // Screen on, even if another app is being used.
            false to false,  // Screen off.
            false to true,   // Doze.
            false to false,  // Doze maintenance window, screen still off.
            true to false,   // Device back in use.
        )
        assertEquals(
            listOf(PowerSaveMode.ACTIVE, PowerSaveMode.BACKGROUND, PowerSaveMode.IDLE,
                PowerSaveMode.BACKGROUND, PowerSaveMode.ACTIVE),
            states.map { (interactive, idle) -> PowerSavePolicy.mode(interactive, idle) },
        )
        assertEquals(PowerSaveMode.IDLE, PowerSavePolicy.mode(interactive = true, deviceIdle = true))
    }

    @Test fun `background and idle do not keep UI polling alive`() {
        for (hasUi in listOf(false, true)) {
            assertEquals(60_000L, TrafficPollingPolicy.delayMillis(hasUi, PowerSaveMode.BACKGROUND))
            assertEquals(60_000L, TrafficPollingPolicy.proxyIntervalMillis(hasUi, PowerSaveMode.BACKGROUND))
            assertNull(TrafficPollingPolicy.delayMillis(hasUi, PowerSaveMode.IDLE))
        }
        assertEquals(1_000L, TrafficPollingPolicy.delayMillis(true, PowerSaveMode.ACTIVE))
        assertEquals(5_000L, TrafficPollingPolicy.delayMillis(false, PowerSaveMode.ACTIVE))
    }
}
