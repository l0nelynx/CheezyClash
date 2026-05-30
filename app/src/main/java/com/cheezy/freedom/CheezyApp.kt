package com.cheezy.freedom

import android.app.Application
import com.cheezy.freedom.clash.ClashCore
import com.cheezy.freedom.clash.ClashRemoteManager

class CheezyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        
        val processName = if (android.os.Build.VERSION.SDK_INT >= 28) {
            getProcessName()
        } else {
            // Fallback for older versions
            val pid = android.os.Process.myPid()
            val am = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
            am.runningAppProcesses?.find { it.pid == pid }?.processName
        }

        if (processName?.endsWith(":vpn") == true) {
            ClashCore.init(this)
        } else {
            ClashRemoteManager.init(this)
        }
    }
}
