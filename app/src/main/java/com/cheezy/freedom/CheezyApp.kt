package com.cheezy.freedom

import android.app.Application
import androidx.work.Configuration
import com.cheezy.freedom.clash.AppHolder
import com.cheezy.freedom.clash.ClashCore
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.clash.ProfileManager

class CheezyApp : Application(), Configuration.Provider {
    // WorkManager must not allocate our diagnostic JobScheduler IDs (0x434301/2).
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setJobSchedulerJobIdRange(0, 1_000_000).build()

    override fun onCreate() {
        super.onCreate()

        // Firebase Analytics / Crashlytics initialize via FirebaseInitProvider when
        // enabled in the build. FirebaseInitProvider only runs in main, NOT :vpn.
        // The VPN process stores diagnostics locally and never initializes Firebase.
        // CrashReporting applies the same saved switch to Analytics and Crashlytics.
        
        val processName = if (android.os.Build.VERSION.SDK_INT >= 28) {
            getProcessName()
        } else {
            // Fallback for older versions
            val pid = android.os.Process.myPid()
            val am = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
            am.runningAppProcesses?.find { it.pid == pid }?.processName
        }

        val vpn = processName?.endsWith(":vpn") == true
        runCatching { com.cheezy.freedom.diagnostics.CrashReporting.initialize(this, vpn) }
        if (vpn) {
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
