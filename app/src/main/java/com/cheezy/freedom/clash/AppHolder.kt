package com.cheezy.freedom.clash

import android.content.Context

object AppHolder {
    @Volatile
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun get(): Context = appContext ?: error("AppHolder not initialized")
}
