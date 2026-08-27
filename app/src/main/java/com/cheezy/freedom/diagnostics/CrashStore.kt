package com.cheezy.freedom.diagnostics

import java.io.Closeable
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.channels.FileChannel
import java.nio.channels.FileLock
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class CrashExit(
    val runId: String?, val pid: Int, val time: Long, val reason: Int,
    val category: String?, val signal: Int? = null, val stack: CrashStack? = null,
)

/** All paths are app-private. The SDK is never called by this cross-process store. */
class CrashStore(val root: File, private val now: () -> Long = System::currentTimeMillis) {
    companion object {
        val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
        private val localLock = Any()
        private val liveRuns = mutableSetOf<String>()
        private val idPattern = Regex("[a-f0-9-]{36}")

        fun atomicWrite(file: File, bytes: ByteArray) {
            file.parentFile!!.mkdirs()
            val temp = File(file.parentFile, "${file.name}.${UUID.randomUUID()}.tmp")
            try {
                FileOutputStream(temp).use { it.write(bytes); it.fd.sync() }
                Files.move(temp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } finally {
                temp.delete()
            }
        }

        fun boundedRead(input: InputStream): Pair<ByteArray, Boolean> = input.use {
            val out = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (out.size() <= MAX_INPUT_BYTES) {
                val read = it.read(buffer, 0, minOf(buffer.size, MAX_INPUT_BYTES + 1 - out.size()))
                if (read < 0) break
                out.write(buffer, 0, read)
            }
            val bytes = out.toByteArray()
            (if (bytes.size > MAX_INPUT_BYTES) bytes.copyOf(MAX_INPUT_BYTES) else bytes) to (bytes.size > MAX_INPUT_BYTES)
        }
    }

    private val runs get() = File(root, "runs").apply { mkdirs() }
    private val queue get() = File(root, "queue").apply { mkdirs() }

    fun <T> locked(action: () -> T): T = synchronized(localLock) {
        root.mkdirs()
        RandomAccessFile(File(root, "store.lock"), "rw").use { f ->
            f.channel.lock().use { action() }
        }
    }

    /** Atomic rename makes this safe for the fatal handler without taking importer locks. */
    fun policy(): CrashPolicy = runCatching {
        val file = File(root, "policy.json")
        require(file.length() <= 4096)
        json.decodeFromString<CrashPolicy>(file.readText())
    }.getOrElse { CrashPolicy(false, "", Long.MAX_VALUE) }

    fun initializePolicy(): CrashPolicy = locked {
        val file = File(root, "policy.json")
        if (!file.exists()) {
            val initial = CrashPolicy(true, UUID.randomUUID().toString(), now())
            atomicWrite(file, json.encodeToString(initial).toByteArray())
        }
        policy()
    }

    fun setEnabled(enabled: Boolean): CrashPolicy = locked {
        val next = CrashPolicy(enabled, UUID.randomUUID().toString(), now())
        atomicWrite(File(root, "policy.json"), json.encodeToString(next).toByteArray())
        queue.listFiles().orEmpty().forEach { it.delete() }
        // Never unlink a live lock inode. An old writer may still have its raw FD
        // open briefly, but the revoked epoch cannot be imported or uploaded.
        runs.listFiles().orEmpty().forEach { dir ->
            dir.listFiles().orEmpty().filter { it.name != "run.lock" }.forEach { it.delete() }
            withDeadRun(dir) { deleteRun(dir) }
        }
        next
    }

    class RunHandle(val directory: File, val channel: FileChannel, private val lock: FileLock) : Closeable {
        override fun close() = synchronized(localLock) {
            try { lock.release() } finally {
                channel.close()
                liveRuns.remove(directory.absolutePath)
            }
        }
    }

    fun begin(run: CrashRun): RunHandle = locked {
        require(idPattern.matches(run.id))
        val dir = File(runs, run.id).apply { mkdirs() }
        val channel = RandomAccessFile(File(dir, "run.lock"), "rw").channel
        try {
            val handle = RunHandle(dir, channel, channel.lock())
            writeRun(handle, run)
            liveRuns.add(dir.absolutePath)
            handle
        } catch (t: Throwable) { channel.close(); throw t }
    }

    fun writeRun(handle: RunHandle, run: CrashRun) {
        atomicWrite(File(handle.directory, "run.json"), json.encodeToString(run).toByteArray())
    }

    fun writeJvm(handle: RunHandle, stacks: List<CrashStack>) {
        var bounded = stacks.take(4)
        var bytes = json.encodeToString(bounded).toByteArray()
        if (bytes.size > MAX_REPORT_BYTES) {
            bounded = bounded.map { it.copy(frames = it.frames.take(16), incomplete = true) }
            bytes = json.encodeToString(bounded).toByteArray()
        }
        require(bytes.size <= MAX_REPORT_BYTES)
        atomicWrite(File(handle.directory, "jvm.json"), bytes)
    }

    private fun readRun(dir: File): CrashRun? = runCatching {
        val file = File(dir, "run.json")
        require(file.length() <= MAX_REPORT_BYTES)
        json.decodeFromString<CrashRun>(file.readText()).also { require(it.id == dir.name) }
    }.getOrNull()

    private fun <T> withDeadRun(dir: File, action: () -> T): T? {
        if (!dir.isDirectory) return null
        // POSIX record locks can be released when ANY FD for the same inode is
        // closed in the owner process. Never open a second FD for our live run,
        // even just to discover an overlapping Java FileLock.
        if (synchronized(localLock) { dir.absolutePath in liveRuns }) return null
        return runCatching {
            RandomAccessFile(File(dir, "run.lock"), "rw").use { file ->
                val lock = file.channel.tryLock() ?: return@use null
                lock.use { action() }
            }
        }.getOrNull()
    }

    private fun deleteRun(dir: File) {
        // Only direct children of this store's UUID run directory, never arbitrary paths.
        dir.listFiles().orEmpty().forEach { if (it.isFile) it.delete() }
        dir.delete()
    }

    fun importReports(exits: List<CrashExit>) = locked {
        val policy = policy()
        if (!policy.enabled) return@locked
        val allRuns = runs.listFiles().orEmpty().filter { idPattern.matches(it.name) }
            .mapNotNull { dir ->
                val metadata = readRun(dir)
                if (metadata == null) withDeadRun(dir) { deleteRun(dir) }
                metadata?.let { dir to it }
            }
        for ((dir, run) in allRuns) withDeadRun(dir) {
            if (run.epoch != policy.epoch) {
                deleteRun(dir)
                return@withDeadRun
            }
            val nextStart = allRuns.map { it.second }.filter { it.pid == run.pid && it.startedAt > run.startedAt }
                .minOfOrNull { it.startedAt } ?: Long.MAX_VALUE
            val exit = exits.firstOrNull {
                it.time >= policy.since && (it.runId == run.id || (it.runId == null &&
                    it.pid == run.pid && it.time >= run.startedAt && it.time < nextStart))
            }
            val goFile = File(dir, "go.log")
            val jvmFile = File(dir, "jvm.json")
            val pending = readQueued(File(queue, "${run.id}.json"))
            val handled = File(dir, "handled")
            // Retention starts at the crash, not process start: a VPN can stay
            // alive for weeks before a new crash creates its first dump.
            val evidenceTime = maxOf(exit?.time ?: 0, pending?.occurredAt ?: 0,
                if (goFile.length() > 0) goFile.lastModified() else 0,
                jvmFile.lastModified(), handled.lastModified())
            val observed = File(dir, "exit-pending-since")
            if (evidenceTime == 0L && !observed.exists()) atomicWrite(observed, byteArrayOf(1))
            val retentionStart = if (evidenceTime > 0) evidenceTime else observed.lastModified()
            if (now() - retentionStart > RETENTION_MS) {
                deleteRun(dir)
                return@withDeadRun
            }
            if (handled.exists()) return@withDeadRun
            val go = if (goFile.length() > 0) runCatching {
                val (bytes, truncated) = boundedRead(goFile.inputStream())
                CrashParsers.go(bytes, truncated)
            }.getOrElse { CrashStack("go.runtime", incomplete = true) } else null
            val jvm = if (jvmFile.exists()) runCatching {
                require(jvmFile.length() <= MAX_REPORT_BYTES)
                json.decodeFromString<List<CrashStack>>(jvmFile.readText())
            }.getOrElse { listOf(CrashStack("jvm", incomplete = true)) } else emptyList()
            val category = when {
                go != null -> "core_go_crash"
                jvm.isNotEmpty() -> "vpn_jvm_crash"
                else -> pending?.category ?: exit?.category
            }
            if (category != null) {
                val stacks = (listOfNotNull(go) + jvm + listOfNotNull(exit?.stack)).take(6)
                val report = CrashEnvelope(eventId = run.id, run = run, category = category,
                    occurredAt = exit?.time ?: pending?.occurredAt ?: maxOf(goFile.lastModified(), jvmFile.lastModified()),
                    stacks = stacks, exitReason = exit?.reason, signal = exit?.signal,
                    incomplete = stacks.isEmpty() || stacks.any { it.incomplete })
                put(report)
            }
            if (category != null || exit != null) {
                // Keep source metadata for late system records, but never the raw dump.
                goFile.delete()
                jvmFile.delete()
                if (category == null) atomicWrite(File(dir, "handled"), byteArrayOf(1))
            }
        }
        prune()
    }

    private fun put(incoming: CrashEnvelope) {
        val file = File(queue, "${incoming.eventId}.json")
        val existing = runCatching {
            require(file.length() <= MAX_REPORT_BYTES)
            json.decodeFromString<CrashEnvelope>(file.readText())
        }.getOrNull()
        // Enrich a queued report, but preserve the first (Go/JVM) category and stack.
        // Once handed to the SDK, the run's handled marker prevents a second event.
        val report = existing?.copy(
            exitReason = existing.exitReason ?: incoming.exitReason,
            signal = existing.signal ?: incoming.signal,
            stacks = (existing.stacks + incoming.stacks).distinct().take(6),
        ) ?: incoming
        var bytes = json.encodeToString(report).toByteArray()
        if (bytes.size > MAX_REPORT_BYTES) bytes = json.encodeToString(
            report.copy(stacks = report.stacks.take(1).map { it.copy(frames = it.frames.take(16), incomplete = true) }, incomplete = true)
        ).toByteArray()
        require(bytes.size <= MAX_REPORT_BYTES)
        if (existing != report) atomicWrite(file, bytes)
    }

    private fun prune() {
        val files = queue.listFiles().orEmpty().map { it to readQueued(it) }
            .sortedByDescending { it.second?.occurredAt ?: Long.MIN_VALUE }
        files.forEachIndexed { index, (file, report) ->
            if (report == null || index >= 16 || now() - report.occurredAt > RETENTION_MS) {
                markHandled(file.nameWithoutExtension)
                file.delete()
            }
        }
    }

    private fun readQueued(file: File): CrashEnvelope? = runCatching {
        require(file.length() <= MAX_REPORT_BYTES)
        json.decodeFromString<CrashEnvelope>(file.readText()).also {
            require(it.schemaVersion == 1 && it.eventId == file.nameWithoutExtension)
        }
    }.getOrNull()

    fun drain(limit: Int, accept: (CrashEnvelope) -> Unit): Int = locked {
        if (!policy().enabled) return@locked 0
        prune()
        var count = 0
        for (file in queue.listFiles().orEmpty().sortedBy { it.lastModified() }.take(limit.coerceAtLeast(0))) {
            // A sender can die after committing the handled marker but before
            // deleting its queue file. The durable marker wins on the next launch.
            if (File(runs, "${file.nameWithoutExtension}/handled").exists()) {
                file.delete()
                continue
            }
            val report = readQueued(file)
            if (report != null && report.run.epoch == policy().epoch) {
                accept(report)
                count++
            }
            markHandled(file.nameWithoutExtension)
        }
        count
    }

    private fun markHandled(id: String) {
        if (!idPattern.matches(id)) return
        val dir = File(runs, id)
        if (dir.isDirectory) atomicWrite(File(dir, "handled"), byteArrayOf(1))
        File(queue, "$id.json").delete()
    }

    fun hasPending(): Boolean = queue.listFiles().orEmpty().any { it.extension == "json" }

    fun hasActiveRun(): Boolean = runs.listFiles().orEmpty().any { dir ->
        val run = readRun(dir) ?: return@any false
        run.epoch == policy().epoch && run.serviceActive && withDeadRun(dir) { false } != false
    }

    /** Android can publish an exit record after Binder death/local import. Retry,
     * but never turn this absence of evidence into a synthetic crash. */
    fun hasAwaitingSystemExit(): Boolean = runs.listFiles().orEmpty().any { dir ->
        val run = readRun(dir) ?: return@any false
        run.sdk >= 30 && run.epoch == policy().epoch && now() -
            maxOf(run.startedAt, File(dir, "exit-pending-since").lastModified()) <= RETENTION_MS &&
            !File(dir, "handled").exists() && withDeadRun(dir) { true } == true
    }
}
