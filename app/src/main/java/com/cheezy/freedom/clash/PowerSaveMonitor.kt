package com.cheezy.freedom.clash

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.github.kr328.clash.core.model.PowerSaveMode
import java.io.Closeable

/** Lives in :vpn, so screen/Doze transitions do not depend on an Activity or Binder client. */
internal class PowerSaveMonitor(
    private val context: Context,
    private val onModeChanged: (PowerSaveMode) -> Unit,
) : Closeable {
    private val powerManager = context.getSystemService(PowerManager::class.java)
    private var registered = false
    private var reportedMode: PowerSaveMode? = null

    @Volatile
    var mode = PowerSaveMode.ACTIVE
        private set

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            refresh()
        }
    }

    fun start() {
        if (registered) return
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        registered = true
        // These broadcasts are not sticky. Supply a snapshot before loading any config,
        // including when the service is restarted with the screen already off/in Doze.
        refresh()
    }

    private fun refresh() {
        val next = PowerSavePolicy.mode(powerManager.isInteractive, powerManager.isDeviceIdleMode)
        if (reportedMode == next) return
        mode = next
        onModeChanged(next)
        reportedMode = next
    }

    override fun close() {
        if (!registered) return
        context.unregisterReceiver(receiver)
        registered = false
        reportedMode = null
    }
}
