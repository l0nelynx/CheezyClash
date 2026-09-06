package com.cheezy.freedom.clash

import org.junit.Assert.*
import org.junit.Test

class TrafficPollingPolicyTest {
    @Test fun `background loop wakes less often while preserving notification checks`() {
        assertEquals(60L, 60_000 / TrafficPollingPolicy.delayMillis(true))
        assertEquals(12L, 60_000 / TrafficPollingPolicy.delayMillis(false))
        assertEquals(5_000L, TrafficPollingPolicy.proxyIntervalMillis(false))
    }
}
