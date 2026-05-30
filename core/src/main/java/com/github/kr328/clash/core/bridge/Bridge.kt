package com.github.kr328.clash.core.bridge

import android.content.Context
import androidx.annotation.Keep
import kotlinx.coroutines.CompletableDeferred

@Keep
object Bridge {
    @Volatile
    @JvmStatic
    internal var appContext: Context? = null
        private set

    external fun nativeReset()
    external fun nativeForceGc()
    external fun nativeSuspend(suspend: Boolean)
    external fun nativeQueryTunnelState(): String
    external fun nativeQueryTrafficNow(): Long
    external fun nativeQueryTrafficTotal(): Long
    external fun nativeNotifyDnsChanged(dnsList: String)
    external fun nativeNotifyTimeZoneChanged(name: String, offset: Int)
    external fun nativeNotifyInstalledAppChanged(uidList: String)
    external fun nativeStartTun(fd: Int, stack: String, gateway: String, portal: String, dns: String, cb: TunInterface)
    external fun nativeStopTun()
    external fun nativeStartHttp(listenAt: String): String?
    external fun nativeStopHttp()
    external fun nativeQueryGroupNames(excludeNotSelectable: Boolean): String
    external fun nativeQueryGroup(name: String, sort: String): String?
    external fun nativeHealthCheck(completable: CompletableDeferred<Unit>, name: String)
    external fun nativeHealthCheckAll()
    external fun nativePatchSelector(selector: String, name: String): Boolean
    external fun nativeFetchAndValid(
        completable: FetchCallback,
        path: String,
        url: String,
        force: Boolean
    )

    external fun nativeLoad(completable: CompletableDeferred<Unit>, path: String)
    external fun nativeQueryProviders(): String
    external fun nativeUpdateProvider(
        completable: CompletableDeferred<Unit>,
        type: String,
        name: String
    )
    external fun nativeReadOverride(slot: Int): String
    external fun nativeWriteOverride(slot: Int, content: String)
    external fun nativeClearOverride(slot: Int)
    external fun nativeQueryConfiguration(): String
    external fun nativeSubscribeLogcat(callback: LogcatInterface)
    external fun nativeCoreVersion(): String
    external fun nativeMihomoVersion(): String

    private external fun nativeInit(home: String, versionName: String, sdkVersion: Int)

    fun init(home: String, versionName: String, sdkVersion: Int) {
        ensureLoaded()
        nativeInit(home, versionName, sdkVersion)
    }

    /**
     * Грузит libbridge.so без вызова nativeInit. Безопасно дёргать из
     * любого процесса (например, UI), которому нужно прочитать read-only
     * данные через JNI (nativeMihomoVersion / nativeCoreVersion). Идемпотентно —
     * System.loadLibrary в один и тот же process игнорирует повторные вызовы.
     */
    @JvmStatic
    fun ensureLoaded() {
        System.loadLibrary("bridge")
    }

    /** Передаём application context из :app, чтобы Content.open мог открыть content:// URI. */
    fun attachContext(context: Context) {
        appContext = context.applicationContext
    }
}
