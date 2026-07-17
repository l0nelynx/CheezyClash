package com.cheezy.freedom.util

import android.util.Log
import java.net.Inet4Address
import java.net.NetworkInterface

object NetworkUtils {
    private const val TAG = "NetworkUtils"

    fun getLocalIpAddress(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                // Ignore loopback, inactive interfaces, and TUN/TAP interfaces
                if (networkInterface.isLoopback || !networkInterface.isUp ||
                    networkInterface.name.startsWith("tun") ||
                    networkInterface.name.startsWith("utun")) continue

                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress && address is Inet4Address) {
                        return address.hostAddress
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to resolve local IP", e)
        }
        return null
    }
}
