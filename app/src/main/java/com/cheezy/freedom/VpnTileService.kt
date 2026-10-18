package com.cheezy.freedom

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import androidx.core.content.ContextCompat
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.clash.ClashVpnService
import com.cheezy.freedom.clash.ConfigManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.io.Closeable

class VpnTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var watchJob: Job? = null
    private var clickJob: Job? = null
    private var connection: Closeable? = null

    override fun onStartListening() {
        super.onStartListening()
        
        // A TileService does not bring ProcessLifecycleOwner to the foreground.
        // Keep our own binding instead of displaying the last Activity snapshot.
        if (connection == null) connection = ClashRemoteManager.acquireConnection()
        watchJob?.cancel()
        watchJob = scope.launch {
            combine(
                ClashState.running, ClashRemoteManager.connected, ClashState.phase,
            ) { running, connected, phase ->
                if (connected && !phase.isBusy) running else null
            }.collectLatest {
                updateTile(it)
            }
        }
    }

    override fun onStopListening() {
        watchJob?.cancel()
        watchJob = null
        connection?.close()
        connection = null
        super.onStopListening()
    }

    override fun onDestroy() {
        watchJob?.cancel()
        connection?.close()
        connection = null
        scope.cancel()
        super.onDestroy()
    }

    override fun onClick() {
        super.onClick()

        if (clickJob?.isActive == true) return
        clickJob = scope.launch {
            try {
                // Query the remote process even if the cached state says "running".
                val isRunning = ClashRemoteManager.isRunningChecked()
                if (ClashState.phase.value.isBusy) return@launch
                handleClick(isRunning)
            } catch (error: TimeoutCancellationException) {
                Log.w("VpnTileService", "VPN service connection timed out", error)
                launchMain()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w("VpnTileService", "Could not query VPN state", error)
                launchMain()
            }
        }
    }

    private fun handleClick(isRunning: Boolean) {
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
            @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
            startActivityAndCollapse(intent)
        }
    }

    private fun updateTile(running: Boolean?) {
        val tile = qsTile ?: return
        
        tile.state = when (running) {
            true -> Tile.STATE_ACTIVE
            false -> Tile.STATE_INACTIVE
            null -> Tile.STATE_UNAVAILABLE
        }
        tile.label = getString(R.string.app_name)
        tile.contentDescription = when (running) {
            true -> "VPN connected"
            false -> "VPN disconnected"
            null -> "VPN state unavailable"
        }
        
        // Use either the system icon or ours
        tile.icon = Icon.createWithResource(this, R.drawable.ic_tile)

        tile.updateTile()
    }
}
