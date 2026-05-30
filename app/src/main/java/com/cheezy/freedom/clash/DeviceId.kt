package com.cheezy.freedom.clash

import android.content.Context
import java.util.UUID

object DeviceId {
    private const val PREFS = "cheezy.device"
    private const val KEY_HWID = "hwid"

    fun get(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY_HWID, null)?.let { return it }
        val id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_HWID, id).apply()
        return id
    }
}
