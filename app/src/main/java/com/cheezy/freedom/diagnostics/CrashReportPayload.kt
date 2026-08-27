package com.cheezy.freedom.diagnostics

/** Testable final boundary: no raw dump or Android/SDK state is accepted here. */
data class CrashReportPayload(val error: Throwable, val keys: Map<String, String>) {
    companion object {
        fun from(report: CrashEnvelope): CrashReportPayload {
            val keys = linkedMapOf(
                "origin_process" to report.run.process,
                "crash_category" to report.category,
                "process_terminated" to "true",
                "event_id" to report.eventId,
                "run_id" to report.run.id,
                "source_app_version" to report.run.appVersion,
                "source_app_version_code" to report.run.appVersionCode.toString(),
                "source_core_version" to report.run.coreVersion,
                "source_abi" to report.run.abi,
                "source_api" to report.run.sdk.toString(),
                "vpn_stage" to report.run.stage,
                "occurred_at" to report.occurredAt.toString(),
                "incomplete" to report.incomplete.toString(),
                "exit_reason" to (report.exitReason ?: -1).toString(),
                "signal" to (report.signal ?: -1).toString(),
            )
            report.stacks.flatMap { it.frames }.filter { it.relativePc.isNotEmpty() }.take(32).forEachIndexed { i, frame ->
                keys["native_frame_$i"] = "${frame.file}|${frame.buildId}|${frame.relativePc}"
            }
            var cause: Throwable? = null
            for (stack in report.stacks.asReversed()) {
                cause = RemoteProcessCrash(stack.type, cause).apply {
                    // Prevent the sender's R8 mapping from modifying old source frames.
                    stackTrace = stack.frames.map { frame ->
                        StackTraceElement("source.${frame.symbol.substringBeforeLast('.', "native")}",
                            frame.symbol.substringAfterLast('.'), frame.file, frame.line)
                    }.toTypedArray()
                }
            }
            val error = RemoteProcessCrash(report.category, cause).apply {
                stackTrace = cause?.stackTrace ?: emptyArray()
            }
            return CrashReportPayload(error, keys)
        }
    }
}

private class RemoteProcessCrash(message: String, cause: Throwable?) : RuntimeException(message, cause)

/** One instance per main process, not per job/foreground transition or policy epoch. */
class CrashDeliverySession {
    private var submitted = 0
    fun drain(store: CrashStore, sink: CrashReportSink) {
        store.drain(4 - submitted) {
            sink.record(it)
            // Count immediately, even if a later event or handled-marker write fails.
            submitted++
        }
    }
}
