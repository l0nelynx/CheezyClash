package com.cheezy.freedom

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.core.content.ContextCompat
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ClashVpnService
import com.cheezy.freedom.clash.ConfigManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class VpnTileService : TileService() {

    private var scope: CoroutineScope? = null
    private var watchJob: Job? = null

    override fun onStartListening() {
        super.onStartListening()
        
        // Immediately update state when the quick settings panel is opened
        updateTile(ClashState.running.value)

        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        watchJob = scope?.launch {
            ClashState.running.collectLatest { 
                updateTile(it) 
            }
        }
    }

    override fun onStopListening() {
        watchJob?.cancel()
        watchJob = null
        scope = null
        super.onStopListening()
    }

    override fun onClick() {
        super.onClick()

        val isRunning = ClashState.running.value

        if (isRunning) {
            ClashVpnService.stop(this)
        } else {
            if (!ConfigManager.hasConfig(this)) {
                launchMain()
                return
            }

            // Local Network Permission (Android 16+/17+) — runtime-grants cannot be requested
            // from a TileService, so if it's missing, we open MainActivity which has the
            // UI flow for the request. Without the grant, VPN will still start and work
            // via loopback, but inbound LAN reachability on mixed-port will not work.
            // Therefore, it's more correct to lead the user to the full UX.
            if (!localNetworkPermissionGranted()) {
                launchMain()
                return
            }

            val prep = VpnService.prepare(this)
            if (prep != null) {
                launchMain()
            } else {
                ClashVpnService.start(this)
            }
        }
    }

    private fun localNetworkPermissionGranted(): Boolean {
        val perm = when {
            Build.VERSION.SDK_INT >= 37 -> "android.permission.ACCESS_LOCAL_NETWORK"
            Build.VERSION.SDK_INT >= 33 -> Manifest.permission.NEARBY_WIFI_DEVICES
            else -> return true
        }
        return ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED
    }

    private fun launchMain() {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(
                android.app.PendingIntent.getActivity(
                    this, 0, intent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
                )
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    private fun updateTile(running: Boolean) {
        val tile = qsTile ?: return
        
        tile.state = if (running) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = getString(R.string.app_name)
        tile.contentDescription = if (running) "VPN connected" else "VPN disconnected"
        
        // Use either the system icon or ours
        tile.icon = Icon.createWithResource(this, R.drawable.ic_tile)

        tile.updateTile()
    }
}
