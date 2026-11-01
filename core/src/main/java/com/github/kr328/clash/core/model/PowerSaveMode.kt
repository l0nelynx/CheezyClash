package com.github.kr328.clash.core.model

/** Values match component/powersave.Mode in the Go core. */
enum class PowerSaveMode(val nativeValue: Int) {
    ACTIVE(0),
    BACKGROUND(1),
    IDLE(2),
}
