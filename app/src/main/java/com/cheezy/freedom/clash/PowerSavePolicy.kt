package com.cheezy.freedom.clash

import com.github.kr328.clash.core.model.PowerSaveMode

internal object PowerSavePolicy {
    fun mode(interactive: Boolean, deviceIdle: Boolean): PowerSaveMode = when {
        deviceIdle -> PowerSaveMode.IDLE
        !interactive -> PowerSaveMode.BACKGROUND
        else -> PowerSaveMode.ACTIVE
    }
}
