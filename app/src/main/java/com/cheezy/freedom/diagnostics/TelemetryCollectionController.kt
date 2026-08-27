package com.cheezy.freedom.diagnostics

/** Shared SDK policy, isolated from Firebase/Android for local regression tests. */
internal class TelemetryCollectionController(
    private val setAnalyticsEnabled: (Boolean) -> Unit,
    private val setCrashlyticsEnabled: (Boolean) -> Unit,
    private val resetAnalyticsData: () -> Unit,
) {
    fun setEnabled(enabled: Boolean) {
        // Stop collection before clearing local events / resetting the instance ID.
        setAnalyticsEnabled(enabled)
        setCrashlyticsEnabled(enabled)
        if (!enabled) resetAnalyticsData()
    }
}
