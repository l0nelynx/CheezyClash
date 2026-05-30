package com.cheezy.freedom.clash

import android.content.Context
import android.os.Build
import com.github.kr328.clash.core.bridge.Bridge

object ClashCore {
    @Volatile
    private var initialized = false

    fun init(context: Context) {
        if (initialized) return
        synchronized(this) {
            if (initialized) return
            val app = context.applicationContext
            AppHolder.init(app)
            val home = app.filesDir.resolve("clash").apply { mkdirs() }
            val versionName = runCatching {
                app.packageManager.getPackageInfo(app.packageName, 0).versionName
            }.getOrNull() ?: "unknown"
            Bridge.attachContext(app)
            Bridge.init(home.absolutePath, versionName, Build.VERSION.SDK_INT)
            initialized = true
        }
    }
}
