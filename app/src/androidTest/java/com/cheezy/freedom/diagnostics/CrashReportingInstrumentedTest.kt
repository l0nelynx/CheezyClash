package com.cheezy.freedom.diagnostics

import android.app.Application
import android.app.job.JobScheduler
import androidx.test.platform.app.InstrumentationRegistry
import com.cheezy.freedom.BuildConfig
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

/** Does not deliberately crash or start a VPN. Destructive device matrix: docs/crash-reporting.md. */
class CrashReportingInstrumentedTest {
    @Test fun policyAndJobs() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assertFalse(Application.getProcessName().endsWith(":vpn"))
        val scheduler = context.getSystemService(JobScheduler::class.java)
        val previous = CrashReporting.enabled(context)
        try {
            CrashReporting.setEnabled(context, false)
            assertFalse(CrashReporting.enabled(context))
            assertTrue(scheduler.allPendingJobs.none { it.service.className == CrashReportJobService::class.java.name })
            CrashReporting.setEnabled(context, true)
            assertEquals(BuildConfig.FIREBASE_ENABLED, CrashReporting.enabled(context))
            if (BuildConfig.FIREBASE_ENABLED) {
                CrashReportJobs.arm(context)
                val periodic = scheduler.allPendingJobs.single { it.isPeriodic && it.service.className == CrashReportJobService::class.java.name }
                assertTrue(periodic.isPersisted)
                assertEquals(15 * 60_000L, periodic.intervalMillis)
                assertEquals(context.packageName, periodic.service.packageName)
            } else {
                assertTrue(scheduler.allPendingJobs.none { it.service.className == CrashReportJobService::class.java.name })
            }
        } finally { CrashReporting.setEnabled(context, previous) }
    }
}
