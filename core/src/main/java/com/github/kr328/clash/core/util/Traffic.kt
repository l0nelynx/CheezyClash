package com.github.kr328.clash.core.util

fun trafficUploadBytes(packed: Long): Long = scaleTraffic((packed ushr 32) and 0xFFFFFFFFL) / 100L

fun trafficDownloadBytes(packed: Long): Long = scaleTraffic(packed and 0xFFFFFFFFL) / 100L

fun trafficTotalBytes(packed: Long): Long = trafficUploadBytes(packed) + trafficDownloadBytes(packed)

private fun scaleTraffic(value: Long): Long {
    val type = (value ushr 30) and 0x3L
    val data = value and 0x3FFFFFFFL
    return when (type) {
        0L -> data
        1L -> data * 1024L
        2L -> data * 1024L * 1024L
        3L -> data * 1024L * 1024L * 1024L
        else -> 0L
    }
}
