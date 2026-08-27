package com.cheezy.freedom.diagnostics

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

object CrashReportJobs {
    private const val PERIODIC = 0x434301
    private const val ONCE = 0x434302
    fun arm(context: Context) {
        val scheduler = context.getSystemService(JobScheduler::class.java)
        if (scheduler.getPendingJob(PERIODIC) == null) scheduler.schedule(
            JobInfo.Builder(PERIODIC, ComponentName(context, CrashReportJobService::class.java))
                .setPeriodic(15 * 60_000L).setPersisted(true).build())
    }
    fun soon(context: Context) {
        val scheduler = context.getSystemService(JobScheduler::class.java)
        if (scheduler.getPendingJob(ONCE) == null) scheduler.schedule(
            JobInfo.Builder(ONCE, ComponentName(context, CrashReportJobService::class.java))
                .setMinimumLatency(30_000).setPersisted(true).build())
    }
    fun cancel(context: Context) {
        context.getSystemService(JobScheduler::class.java).apply { cancel(PERIODIC); cancel(ONCE) }
    }
}

/** Default/main process. No foreground service, Activity, binding, or native calls. */
class CrashReportJobService : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val jobs = mutableMapOf<Int, Job>()
    override fun onStartJob(params: JobParameters): Boolean {
        jobs[params.jobId] = scope.launch {
            try { CrashReporting.collectAndSend() }
            finally { if (isActive) jobFinished(params, false) }
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean {
        jobs.remove(params.jobId)?.cancel()
        return true
    }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
