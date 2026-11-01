package com.cheezy.freedom.clash

import com.github.kr328.clash.core.model.PowerSaveMode

internal object TrafficPollingPolicy {
    fun delayMillis(hasUi: Boolean): Long = if (hasUi) 1_000 else 5_000

    /** null means no periodic wake-ups; screen/Doze and Binder events wake the loop. */
    fun delayMillis(hasUi: Boolean, mode: PowerSaveMode): Long? = when (mode) {
        PowerSaveMode.ACTIVE -> delayMillis(hasUi)
        PowerSaveMode.BACKGROUND -> 60_000
        PowerSaveMode.IDLE -> null
    }

    fun proxyIntervalMillis(hasUi: Boolean, mode: PowerSaveMode = PowerSaveMode.ACTIVE): Long =
        if (mode != PowerSaveMode.ACTIVE) 60_000 else if (hasUi) 2_000 else 5_000
}
