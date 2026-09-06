package com.cheezy.freedom.clash

internal object TrafficPollingPolicy {
    fun delayMillis(hasUi: Boolean): Long = if (hasUi) 1_000 else 5_000
    fun proxyIntervalMillis(hasUi: Boolean): Long = if (hasUi) 2_000 else 5_000
}
