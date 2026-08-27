package com.cheezy.freedom.diagnostics

import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.CustomKeysAndValues
import com.google.firebase.crashlytics.FirebaseCrashlytics

/** Only constructed in the main process. Never initialize Firebase in :vpn. */
object PlatformCrashReportSink : CrashReportSink {
    private val collection by lazy {
        val analytics = FirebaseAnalytics.getInstance(FirebaseApp.getInstance().applicationContext)
        TelemetryCollectionController(
            setAnalyticsEnabled = analytics::setAnalyticsCollectionEnabled,
            setCrashlyticsEnabled = { FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(it) },
            resetAnalyticsData = analytics::resetAnalyticsData,
        )
    }

    override fun setEnabled(enabled: Boolean) = collection.setEnabled(enabled)
    override fun deleteUnsent() { FirebaseCrashlytics.getInstance().deleteUnsentReports() }
    override fun record(report: CrashEnvelope) {
        val payload = CrashReportPayload.from(report)
        val keys = CustomKeysAndValues.Builder()
        payload.keys.forEach { (name, value) -> keys.putString(name, value) }
        FirebaseCrashlytics.getInstance().recordException(payload.error, keys.build())
    }
}
