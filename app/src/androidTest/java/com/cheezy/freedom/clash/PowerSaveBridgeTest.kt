package com.cheezy.freedom.clash

import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import com.github.kr328.clash.core.Clash
import com.github.kr328.clash.core.bridge.Bridge
import com.github.kr328.clash.core.model.PowerSaveMode
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Exercises Kotlin -> JNI -> Go, including the Android-only build tag. */
class PowerSaveBridgeTest {
    /** Uses only a dedicated emulator; screen and Doze changes must not touch a user's phone. */
    @Test fun emulatorScreenAndDozeTransitionsReachTheCore() {
        assumeTrue(Build.HARDWARE in setOf("ranchu", "goldfish"))
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val powerManager = context.getSystemService(PowerManager::class.java)
        ClashCore.init(context)
        val previous = Bridge.nativeQueryPowerSaveMode()
        val wasInteractive = powerManager.isInteractive
        val monitor = PowerSaveMonitor(context, Clash::setPowerSaveMode)
        fun shell(command: String) {
            ParcelFileDescriptor.AutoCloseInputStream(
                instrumentation.uiAutomation.executeShellCommand(command),
            ).bufferedReader().use { it.readText() }
        }
        fun awaitMode(expected: PowerSaveMode) {
            val deadline = SystemClock.elapsedRealtime() + 10_000
            while (Bridge.nativeQueryPowerSaveMode() != expected.nativeValue &&
                SystemClock.elapsedRealtime() < deadline) {
                SystemClock.sleep(50)
            }
            assertEquals(expected.nativeValue, Bridge.nativeQueryPowerSaveMode())
            assertEquals(expected, monitor.mode)
        }
        try {
            // A new host must overwrite the process-local mode, even without a broadcast.
            Bridge.nativeSetPowerSaveMode(PowerSaveMode.IDLE.nativeValue)
            instrumentation.runOnMainSync { monitor.start() }
            awaitMode(PowerSavePolicy.mode(powerManager.isInteractive, powerManager.isDeviceIdleMode))
            shell("cmd deviceidle unforce")
            shell("input keyevent KEYCODE_WAKEUP")
            awaitMode(PowerSaveMode.ACTIVE)
            shell("input keyevent KEYCODE_SLEEP")
            awaitMode(PowerSaveMode.BACKGROUND)
            shell("dumpsys battery unplug")
            shell("cmd deviceidle force-idle")
            awaitMode(PowerSaveMode.IDLE)
            shell("cmd deviceidle unforce")
            awaitMode(PowerSaveMode.BACKGROUND)
            shell("input keyevent KEYCODE_WAKEUP")
            awaitMode(PowerSaveMode.ACTIVE)
            instrumentation.runOnMainSync { monitor.close() }
            Bridge.nativeSetPowerSaveMode(PowerSaveMode.IDLE.nativeValue)
            instrumentation.runOnMainSync { monitor.start() }
            awaitMode(PowerSaveMode.ACTIVE)
        } finally {
            instrumentation.runOnMainSync { monitor.close() }
            shell("cmd deviceidle unforce")
            shell("dumpsys battery reset")
            if (!wasInteractive) shell("input keyevent KEYCODE_SLEEP")
            Bridge.nativeSetPowerSaveMode(previous)
        }
    }

    @Test fun modesRoundTripWithoutSuspendingTheTunnel() {
        ClashCore.init(InstrumentationRegistry.getInstrumentation().targetContext)
        val previous = Bridge.nativeQueryPowerSaveMode()
        val tunnel = Bridge.nativeQueryTunnelState()
        try {
            for (mode in PowerSaveMode.entries) {
                Clash.setPowerSaveMode(mode)
                assertEquals(mode.nativeValue, Bridge.nativeQueryPowerSaveMode())
                assertEquals(tunnel, Bridge.nativeQueryTunnelState())
            }
            Bridge.nativeSetPowerSaveMode(-1)
            assertEquals(PowerSaveMode.IDLE.nativeValue, Bridge.nativeQueryPowerSaveMode())
        } finally {
            Bridge.nativeSetPowerSaveMode(previous)
        }
    }
}
