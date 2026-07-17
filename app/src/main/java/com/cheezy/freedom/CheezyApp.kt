package com.cheezy.freedom

import android.app.Application
import com.cheezy.freedom.clash.AppHolder
import com.cheezy.freedom.clash.ClashCore
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.clash.ProfileManager

class CheezyApp : Application() {
    override fun onCreate() {
        super.onCreate()

        // Firebase Analytics / Crashlytics initialize via FirebaseInitProvider when
        // app/google-services.json is present (both main and :vpn processes). No
        // explicit FirebaseApp.initializeApp() needed.
        
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
            // Main process needs AppHolder too — ClashRemoteManager persists proxy
            // selections via application Context after patchSelector.
            AppHolder.init(this)
            // Main process: migrate a pre-multiprofile single config into profile #1
            // before anything (tile, UI, worker) reads the active profile. Idempotent.
            runCatching { ProfileManager.migrateLegacyIfNeeded(this) }
            ClashRemoteManager.init(this)
        }
    }
}
