package com.cheezy.freedom.diagnostics

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.protobuf.ProtoBuf
import kotlinx.serialization.protobuf.ProtoNumber

object CrashParsers {
    private val goroutineHeader = Regex("^goroutine [0-9]+(?: [^\\[]*)? \\[[^\\]]+\\]:$")
    private val goLocation = Regex("^\\s+(.+\\.(?:go|s)):(\\d+)(?:\\s.*)?$")
    fun go(bytes: ByteArray, truncated: Boolean = false): CrashStack {
        // Only function/source pairs are retained. Panic text, arguments, registers,
        // goroutine labels, created-by details and arbitrary output are discarded.
        val frames = mutableListOf<CrashFrame>()
        var function: String? = null
        var inTrace = false
        for (line in bytes.toString(Charsets.UTF_8).lineSequence()) {
            if (frames.size == MAX_FRAMES) break
            if (goroutineHeader.matches(line)) { inTrace = true; function = null; continue }
            if (!inTrace) continue // Includes multiline panic/fatal message text.
            if (line.startsWith("\t") || line.startsWith("    ")) {
                val location = goLocation.matchEntire(line)
                val pending = function
                if (location != null && pending != null) {
                    frames += CrashFrame(pending, CrashSanitizer.file(location.groupValues[1]),
                        location.groupValues[2].toIntOrNull() ?: -1)
                }
                function = null
            } else {
                // A receiver may contain parentheses: pkg.(*Type).method(args).
                val firstOpen = line.indexOf('(')
                val receiverEnd = if (firstOpen > 0 && line[firstOpen - 1] == '.') line.indexOf(')', firstOpen) else -1
                val argumentStart = if (receiverEnd > firstOpen && line.getOrNull(receiverEnd + 1) == '.') {
                    line.indexOf('(', receiverEnd + 2)
                } else firstOpen
                val name = if (argumentStart > 0) line.substring(0, argumentStart) else ""
                function = name.takeIf { !it.contains(' ') && it.contains('.') }
                    ?.let(CrashSanitizer::symbol)
            }
        }
        return CrashStack("go.runtime", frames, truncated || frames.isEmpty() || frames.size == MAX_FRAMES)
    }

    fun anr(bytes: ByteArray, truncated: Boolean = false): CrashStack {
        // Android ANR traces also contain process names and arbitrary thread names.
        val frame = Regex("^\\s+at ([A-Za-z0-9_.$<>]+)\\(([^():]+)(?::(\\d+))?\\).*$")
        val frames = bytes.toString(Charsets.UTF_8).lineSequence().mapNotNull { line ->
            frame.matchEntire(line)?.let {
                CrashFrame(CrashSanitizer.symbol(it.groupValues[1]), CrashSanitizer.file(it.groupValues[2]),
                    it.groupValues[3].toIntOrNull() ?: -1)
            }
        }.take(MAX_FRAMES).toList()
        return CrashStack("android.anr", frames, truncated || frames.isEmpty())
    }

    @OptIn(ExperimentalSerializationApi::class)
    fun native(bytes: ByteArray): Pair<Int?, CrashStack> = runCatching {
        require(bytes.size <= MAX_INPUT_BYTES)
        val dump = ProtoBuf.decodeFromByteArray(Tombstone.serializer(), bytes)
        val frames = dump.threads[dump.tid]?.backtrace.orEmpty().take(MAX_FRAMES).map {
            CrashFrame(CrashSanitizer.symbol(it.function.ifEmpty { "native" }),
                CrashSanitizer.file(it.file), relativePc = java.lang.Long.toUnsignedString(it.relativePc, 16),
                buildId = it.buildId.takeIf { id -> Regex("[a-fA-F0-9]{1,128}").matches(id) }.orEmpty())
        }
        dump.signal?.number to CrashStack("native", frames, frames.isEmpty())
    }.getOrElse { null to CrashStack("native", incomplete = true) }
}

// Minimal read-only projection of AOSP debuggerd/proto/tombstone.proto.
// https://android.googlesource.com/platform/system/core/+/refs/heads/main/debuggerd/proto/tombstone.proto
// Never model memory/registers/abort_message/log_buffers/command_line/thread.name.
@OptIn(ExperimentalSerializationApi::class)
@Serializable
internal data class Tombstone(
    @ProtoNumber(6) val tid: Int = 0,
    @ProtoNumber(10) val signal: TombstoneSignal? = null,
    @ProtoNumber(16) val threads: Map<Int, TombstoneThread> = emptyMap(),
)
@OptIn(ExperimentalSerializationApi::class)
@Serializable
internal data class TombstoneSignal(@ProtoNumber(1) val number: Int = 0)
@OptIn(ExperimentalSerializationApi::class)
@Serializable
internal data class TombstoneThread(@ProtoNumber(4) val backtrace: List<TombstoneFrame> = emptyList())
@OptIn(ExperimentalSerializationApi::class)
@Serializable
internal data class TombstoneFrame(
    @ProtoNumber(1) val relativePc: Long = 0,
    @ProtoNumber(4) val function: String = "",
    @ProtoNumber(6) val file: String = "",
    @ProtoNumber(8) val buildId: String = "",
)
