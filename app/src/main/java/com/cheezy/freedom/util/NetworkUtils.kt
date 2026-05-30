package com.cheezy.freedom.util

import java.net.Inet4Address
import java.net.NetworkInterface

object NetworkUtils {
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
            e.printStackTrace()
        }
        return null
    }
}
