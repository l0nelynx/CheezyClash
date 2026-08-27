package com.cheezy.freedom.diagnostics

import kotlinx.serialization.Serializable

internal const val MAX_INPUT_BYTES = 2 * 1024 * 1024
internal const val MAX_REPORT_BYTES = 64 * 1024
internal const val MAX_FRAMES = 64
internal const val RETENTION_MS = 7L * 24 * 60 * 60 * 1000

@Serializable
data class CrashPolicy(val enabled: Boolean, val epoch: String, val since: Long)

@Serializable
data class CrashRun(
    val id: String,
    val epoch: String,
    val process: String,
    val pid: Int,
    val startedAt: Long,
    val appVersion: String,
    val appVersionCode: Long,
    val coreVersion: String = "unknown",
    val sdk: Int,
    val abi: String,
    val stage: String = "BOOTSTRAP",
    val serviceActive: Boolean = true,
)

@Serializable
data class CrashFrame(
    val symbol: String,
    val file: String = "",
    val line: Int = -1,
    val relativePc: String = "",
    val buildId: String = "",
)

@Serializable
data class CrashStack(val type: String, val frames: List<CrashFrame> = emptyList(), val incomplete: Boolean = false)

@Serializable
data class CrashEnvelope(
    val schemaVersion: Int = 1,
    val eventId: String,
    val run: CrashRun,
    val category: String,
    val occurredAt: Long,
    val stacks: List<CrashStack> = emptyList(),
    val exitReason: Int? = null,
    val signal: Int? = null,
    val incomplete: Boolean = false,
)

/** No Throwable.message/toString or thread names cross the diagnostic boundary. */
object CrashSanitizer {
    private val symbolPattern = Regex("[A-Za-z0-9_.$/<>*()+\\[\\],:@ ~-]{1,300}")
    fun symbol(value: String): String = value.takeIf { symbolPattern.matches(it) } ?: "unknown"
    fun file(value: String): String {
        val name = value.substringAfterLast('/').substringAfterLast('\\')
        return name.takeIf { Regex("[A-Za-z0-9_.-]{1,100}").matches(it) } ?: "unknown"
    }

    fun throwable(error: Throwable): List<CrashStack> {
        val seen = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<Throwable, Boolean>())
        val result = mutableListOf<CrashStack>()
        var current: Throwable? = error
        while (current != null && result.size < 4 && seen.add(current)) {
            val trace = current.stackTrace
            result += CrashStack(symbol(current.javaClass.name), trace.take(MAX_FRAMES).map {
                CrashFrame(symbol("${it.className}.${it.methodName}"), file(it.fileName.orEmpty()), it.lineNumber)
            }, trace.size > MAX_FRAMES)
            current = current.cause
        }
        return result
    }
}

interface CrashReportSink {
    fun setEnabled(enabled: Boolean)
    fun deleteUnsent()
    /** Acceptance by the SDK, NOT confirmation of persistence or server delivery. */
    fun record(report: CrashEnvelope)
}
