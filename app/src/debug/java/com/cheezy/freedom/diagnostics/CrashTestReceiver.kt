package com.cheezy.freedom.diagnostics

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.github.kr328.clash.core.bridge.Bridge

/** Explicit adb-only faults. Runs in :vpn, including when no Activity is open. */
class CrashTestReceiver : BroadcastReceiver() {
    private external fun nativeCrash(mode: Int): Boolean
    override fun onReceive(context: Context, intent: Intent) {
        Bridge.ensureLoaded()
        when (intent.getStringExtra("kind")) {
            "jvm" -> Handler(Looper.getMainLooper()).post {
                throw IllegalStateException("DIAGNOSTIC_TEST_PRIVATE_MESSAGE")
            }
            "go" -> if (!nativeCrash(1)) Log.w("CrashTest", "Rebuild with -PcrashTestHooks=true for Go faults")
            "go-fatal" -> if (!nativeCrash(2)) Log.w("CrashTest", "Rebuild with -PcrashTestHooks=true for Go faults")
            "abort" -> nativeCrash(3)
            "segfault" -> nativeCrash(4)
            // A system ANR is only collected if Android records REASON_ANR.
            // Debugger attachment/background ANR policy can prevent that outcome.
            "anr" -> Thread.sleep(120_000)
        }
    }
}
