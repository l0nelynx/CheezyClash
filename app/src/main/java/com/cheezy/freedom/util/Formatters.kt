package com.cheezy.freedom.util

import java.text.SimpleDateFormat
import java.time.OffsetDateTime
import java.util.Date
import java.util.Locale

fun formatKbps(bytesPerSec: Long): String {
    val kbps = bytesPerSec * 8.0 / 1000.0
    return if (kbps >= 1000) String.format(Locale.US, "%.1f Mbps", kbps / 1000.0)
    else String.format(Locale.US, "%.0f Kbps", kbps)
}

fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var v = bytes.toDouble()
    var i = 0
    while (v >= 1024 && i < units.lastIndex) { v /= 1024; i++ }
    return String.format(Locale.US, if (i == 0) "%.0f %s" else "%.2f %s", v, units[i])
}

fun formatExpire(unix: Long): String {
    if (unix <= 0L) return "никогда"
    val df = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
    return df.format(Date(unix * 1000))
}

fun parseExpireIso(iso: String?): Long {
    if (iso.isNullOrBlank()) return 0L
    return runCatching { OffsetDateTime.parse(iso).toEpochSecond() }.getOrElse { 0L }
}

fun formatLastUpdate(millis: Long): String {
    val df = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
    return df.format(Date(millis))
}
