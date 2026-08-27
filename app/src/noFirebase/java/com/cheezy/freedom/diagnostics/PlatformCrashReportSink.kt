package com.cheezy.freedom.diagnostics

object PlatformCrashReportSink : CrashReportSink {
    override fun setEnabled(enabled: Boolean) = Unit
    override fun deleteUnsent() = Unit
    override fun record(report: CrashEnvelope) = Unit
}
