package com.cheezy.freedom.diagnostics

import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.FileObserver
import android.os.ParcelFileDescriptor
import android.os.Process
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.cheezy.freedom.BuildConfig
import com.github.kr328.clash.core.bridge.Bridge
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Local capture in :vpn; Firebase and report delivery exclusively in main. */
@android.annotation.SuppressLint("StaticFieldLeak") // Only the process-lifetime applicationContext is retained.
object CrashReporting {
    private const val TAG = "CrashReporting"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))
    private val collectorMutex = Mutex()
    private val captureLock = Any()
    private lateinit var app: Context
    private lateinit var store: CrashStore
    @Volatile private var run: CrashRun? = null
    @Volatile private var handle: CrashStore.RunHandle? = null
    @Volatile private var nativeReady = false
    private var observer: FileObserver? = null
    private val deliverySession = CrashDeliverySession()
    private data class Stage(val name: String, val serviceActive: Boolean)
    @Volatile private var processStage = Stage("BOOTSTRAP", true)

    fun enabled(context: Context): Boolean = BuildConfig.FIREBASE_ENABLED && runCatching {
        CrashStore(File(context.noBackupFilesDir, "crash-reporting")).initializePolicy().enabled
    }.getOrDefault(false)

    fun initialize(context: Context, vpn: Boolean) {
        if (!BuildConfig.FIREBASE_ENABLED) {
            CrashReportJobs.cancel(context)
            val previousStore = File(context.noBackupFilesDir, "crash-reporting")
            if (previousStore.exists()) CrashStore(previousStore).setEnabled(false)
            return
        }
        app = context.applicationContext
        store = CrashStore(File(app.noBackupFilesDir, "crash-reporting"))
        store.initializePolicy()
        if (vpn) {
            val previous = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread, error ->
                // Never wait on the importer, call Binder, or attempt VPN teardown.
                try {
                    val active = run
                    val target = handle
                    val policy = store.policy()
                    if (active != null && target != null && policy.enabled && active.epoch == policy.epoch) {
                        store.writeJvm(target, CrashSanitizer.throwable(error))
                    }
                } catch (_: Throwable) { /* Preserve the original fatal exception. */ }
                finally {
                    if (previous != null) previous.uncaughtException(thread, error)
                    else { Process.killProcess(Process.myPid()); kotlin.system.exitProcess(10) }
                }
            }
            observer = object : FileObserver(store.root.absolutePath, MOVED_TO or CLOSE_WRITE) {
                override fun onEvent(event: Int, path: String?) {
                    if (path == "policy.json") refreshVpnPolicy()
                }
            }.also { it.startWatching() }
            applyVpnPolicy()
            scope.launch {
                safely { store.importReports(readExits()); if (store.hasPending()) CrashReportJobs.soon(app) }
            }
        } else {
            // Keep the existing policy file: prior Crashlytics opt-outs now also
            // disable Analytics, including on the first launch after an update.
            val enabled = store.policy().enabled
            PlatformCrashReportSink.setEnabled(enabled)
            if (!enabled) PlatformCrashReportSink.deleteUnsent()
            ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) { scope.launch { collectAndSend() } }
            })
            scope.launch { collectAndSend() }
        }
    }

    /** Called after dlopen, but before nativeInit/configuration. */
    fun attachNative() {
        if (!BuildConfig.FIREBASE_ENABLED || !::store.isInitialized) return
        nativeReady = true
        synchronized(captureLock) {
            applyVpnPolicy()
            configureNative()
            run?.let { active ->
                val version = runCatching { Bridge.nativeMihomoVersion() }.getOrDefault("unknown")
                run = active.copy(coreVersion = version.take(200))
                handle?.let { store.writeRun(it, run!!) }
            }
        }
    }

    fun refreshVpnPolicy() {
        if (BuildConfig.FIREBASE_ENABLED && ::store.isInitialized) scope.launch { safely { applyVpnPolicy() } }
    }

    private fun applyVpnPolicy() = synchronized(captureLock) {
        val policy = store.policy()
        if (run?.epoch == policy.epoch && policy.enabled) return@synchronized
        if (nativeReady) Bridge.nativeConfigureCrashOutput(-1)
        handle?.close()
        handle = null
        run = null
        if (Build.VERSION.SDK_INT >= 30) runCatching {
            app.getSystemService(ActivityManager::class.java).setProcessStateSummary(null)
        }
        if (!policy.enabled) { CrashReportJobs.cancel(app); return@synchronized }
        val packageInfo = app.packageManager.getPackageInfo(app.packageName, 0)
        val abis = if (Process.is64Bit()) Build.SUPPORTED_64_BIT_ABIS else Build.SUPPORTED_32_BIT_ABIS
        val active = CrashRun(UUID.randomUUID().toString(), policy.epoch, Application.getProcessName(),
            Process.myPid(), System.currentTimeMillis(), packageInfo.versionName.orEmpty(), packageInfo.longVersionCode,
            coreVersion = com.cheezy.freedom.core.BuildConfig.CORE_VERSION.take(200),
            sdk = Build.VERSION.SDK_INT, abi = abis.firstOrNull().orEmpty(),
            stage = processStage.name, serviceActive = processStage.serviceActive)
        handle = store.begin(active)
        run = active
        if (Build.VERSION.SDK_INT >= 30) runCatching {
            app.getSystemService(ActivityManager::class.java).setProcessStateSummary(active.id.toByteArray(Charsets.US_ASCII))
        }
        // Armed while still healthy: no scheduling or IPC is needed from a crash handler.
        CrashReportJobs.arm(app)
        if (nativeReady) configureNative()
    }

    private fun configureNative() {
        val target = handle ?: return
        ParcelFileDescriptor.open(File(target.directory, "go.log"), ParcelFileDescriptor.MODE_CREATE or
            ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_APPEND).use {
            if (!Bridge.nativeConfigureCrashOutput(it.fd)) Log.w(TAG, "Could not attach Go crash output")
        }
    }

    fun stage(stage: String, serviceActive: Boolean = true) {
        processStage = Stage(stage, serviceActive)
        if (!BuildConfig.FIREBASE_ENABLED || !::store.isInitialized) return
        scope.launch { safely {
            synchronized(captureLock) {
                val active = run ?: return@synchronized
                if (active.epoch != store.policy().epoch) return@synchronized
                val current = processStage
                if (current.serviceActive && !active.serviceActive) CrashReportJobs.arm(app)
                run = active.copy(stage = current.name, serviceActive = current.serviceActive)
                handle?.let { store.writeRun(it, run!!) }
                if (!current.serviceActive) CrashReportJobs.soon(app)
            }
        } }
    }

    suspend fun setEnabled(context: Context, enabled: Boolean) {
        if (!BuildConfig.FIREBASE_ENABLED) return
        collectorMutex.withLock {
            store.setEnabled(enabled)
            PlatformCrashReportSink.setEnabled(enabled)
            if (!enabled) {
                CrashReportJobs.cancel(context)
                PlatformCrashReportSink.deleteUnsent()
            } else CrashReportJobs.soon(context)
        }
    }

    fun serviceDisconnected(context: Context) {
        if (BuildConfig.FIREBASE_ENABLED) safely { if (enabled(context)) CrashReportJobs.soon(context) }
    }

    suspend fun collectAndSend() {
        if (!BuildConfig.FIREBASE_ENABLED || !::store.isInitialized || Application.getProcessName().endsWith(":vpn")) return
        collectorMutex.withLock { safely {
            if (!store.policy().enabled) { CrashReportJobs.cancel(app); return@safely }
            store.importReports(readExits())
            deliverySession.drain(store, PlatformCrashReportSink)
            store.locked {
                if (!store.hasPending() && !store.hasActiveRun() && !store.hasAwaitingSystemExit()) CrashReportJobs.cancel(app)
            }
        } }
    }

    private fun readExits(): List<CrashExit> {
        if (Build.VERSION.SDK_INT < 30 || !store.policy().enabled) return emptyList()
        val since = store.policy().since
        return runCatching {
            app.getSystemService(ActivityManager::class.java).getHistoricalProcessExitReasons(app.packageName, 0, 64)
                .filter { it.processName == "${app.packageName}:vpn" && it.timestamp >= since }
                .map { exit ->
                    val category = when (exit.reason) {
                        ApplicationExitInfo.REASON_CRASH -> "vpn_jvm_crash"
                        ApplicationExitInfo.REASON_CRASH_NATIVE -> "vpn_native_crash"
                        ApplicationExitInfo.REASON_ANR -> "vpn_anr"
                        else -> null
                    }
                    var signal: Int? = null
                    val stack = if (category == "vpn_anr" || (category == "vpn_native_crash" && Build.VERSION.SDK_INT >= 31)) {
                        runCatching {
                            exit.traceInputStream?.let { input ->
                                val (bytes, truncated) = CrashStore.boundedRead(input)
                                if (category == "vpn_anr") CrashParsers.anr(bytes, truncated)
                                else CrashParsers.native(bytes).let { (number, trace) ->
                                    signal = number
                                    trace.copy(incomplete = trace.incomplete || truncated)
                                }
                            }
                        }.getOrNull()
                    } else null
                    CrashExit(exit.processStateSummary?.toString(Charsets.US_ASCII), exit.pid,
                        exit.timestamp, exit.reason, category, signal, stack)
                }
        }.getOrDefault(emptyList())
    }

    private inline fun safely(action: () -> Unit) {
        try { action() } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Diagnostic failures must not recursively produce diagnostic reports.
            Log.w(TAG, "Diagnostic operation unavailable; will retry on next collection")
        }
    }
}
