package com.cheezy.freedom

import android.app.Application
import com.cheezy.freedom.clash.ClashCore
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.clash.ProfileManager

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
            // Main process: migrate a pre-multiprofile single config into profile #1
            // before anything (tile, UI, worker) reads the active profile. Idempotent.
            runCatching { ProfileManager.migrateLegacyIfNeeded(this) }
            ClashRemoteManager.init(this)
        }
    }
}
