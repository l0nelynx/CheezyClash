package com.cheezy.freedom.diagnostics

import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.protobuf.ProtoBuf
import kotlinx.serialization.protobuf.ProtoNumber
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CrashDiagnosticsTest {
    @get:Rule val temp = TemporaryFolder()
    private var clock = System.currentTimeMillis()
    private fun store() = CrashStore(temp.newFolder()) { clock }.also { it.initializePolicy() }
    private fun run(store: CrashStore, version: String = "old-app", pid: Int = 100) = CrashRun(
        UUID.randomUUID().toString(), store.policy().epoch, "test:vpn", pid, clock,
        version, 42, "old-core", 36, "arm64-v8a")
    private fun crash(store: CrashStore, run: CrashRun = run(store)): CrashRun {
        store.begin(run).use { store.writeJvm(it, listOf(CrashStack("java.lang.IllegalStateException",
            listOf(CrashFrame("original.Class.method", "Original.kt", 17))))) }
        return run
    }
    private fun drain(store: CrashStore): List<CrashEnvelope> = buildList { store.drain(16, ::add) }

    @Test fun `jvm ignores messages causes messages and sensitive file directories`() {
        val error = IllegalStateException("SECRET_TOKEN", IllegalArgumentException("SECRET_URL"))
        error.stackTrace = arrayOf(StackTraceElement("original.Class", "call", "/SECRET_PATH/Original.kt", 19))
        val encoded = CrashStore.json.encodeToString(CrashSanitizer.throwable(error))
        assertFalse(encoded.contains("SECRET"))
        assertTrue(encoded.contains("Original.kt"))
        assertTrue(encoded.contains("original.Class.call"))
    }

    @Test fun `go strips panic text arguments labels and host directories`() {
        val raw = """panic: SECRET_PANIC https://secret.example 192.0.2.1
SECRET.not_a_frame(SECRET_ARG)
	/SECRET_PATH/fake.go:30

goroutine 123 [SECRET_THREAD]:
example/core.(*Tunnel).run(0x1234, {SECRET_ARGUMENT(nested)})
	/SECRET_HOME/core/tunnel.go:42 +0xa
runtime.goexit({})
	/usr/local/go/src/runtime/asm_arm64.s:1223 +0x4
"""
        val stack = CrashParsers.go(raw.toByteArray())
        assertEquals(CrashFrame("example/core.(*Tunnel).run", "tunnel.go", 42), stack.frames.first())
        assertFalse(CrashStore.json.encodeToString(stack).contains("SECRET"))
        assertFalse(CrashStore.json.encodeToString(stack).contains("192.0.2.1"))
    }

    @Test fun `anr ignores names headers and log text`() {
        val stack = CrashParsers.anr("""Cmd line: SECRET_CONFIG
"SECRET_THREAD" prio=5 tid=1
  at original.Class.call(Original.kt:37)
  SECRET_TOKEN
""".toByteArray())
        assertEquals(1, stack.frames.size)
        assertFalse(CrashStore.json.encodeToString(stack).contains("SECRET"))
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Test fun `partial native protobuf skips secrets and retains crashing thread only`() {
        val native = SecretTombstone(tid = 42, signal = TombstoneSignal(11), secret = "SECRET_ABORT",
            threads = mapOf(42 to SecretThread("SECRET_THREAD", listOf(TombstoneFrame(
                0x1234, "original_function", "/SECRET_PATH/libclash.so", "aabbccdd")))))
        val (signal, stack) = CrashParsers.native(ProtoBuf.encodeToByteArray(SecretTombstone.serializer(), native))
        assertEquals(11, signal)
        assertEquals("1234", stack.frames.single().relativePc)
        assertEquals("aabbccdd", stack.frames.single().buildId)
        assertFalse(CrashStore.json.encodeToString(stack).contains("SECRET"))
    }

    @Test fun `bounded parsers and corrupted inputs produce incomplete report`() {
        assertTrue(CrashParsers.native(byteArrayOf(-1, -1, -1)).second.incomplete)
        assertTrue(CrashParsers.go("panic: SECRET".toByteArray()).incomplete)
        val (bytes, truncated) = CrashStore.boundedRead(ByteArray(MAX_INPUT_BYTES + 12).inputStream())
        assertEquals(MAX_INPUT_BYTES, bytes.size)
        assertTrue(truncated)
        val store = store()
        store.begin(run(store)).use { File(it.directory, "jvm.json").writeText("{broken") }
        store.importReports(emptyList())
        assertTrue(drain(store).single().incomplete)
    }

    @Test fun `one go crash with jvm and late system record is merged once`() {
        val store = store()
        val run = run(store)
        store.begin(run).use {
            File(it.directory, "go.log").writeText("panic: SECRET\ngoroutine 1 [running]:\ncore.worker(SECRET)\n\t/private/worker.go:12 +0x1\n")
            store.writeJvm(it, listOf(CrashStack("jvm")))
        }
        store.importReports(emptyList())
        val exit = CrashExit(run.id, run.pid, clock, 5, "vpn_native_crash", 6,
            CrashStack("native", listOf(CrashFrame("native", "libclash.so", relativePc = "123"))))
        store.importReports(listOf(exit))
        val report = drain(store).single()
        assertEquals("core_go_crash", report.category)
        assertEquals(6, report.signal)
        assertEquals(3, report.stacks.size)
        store.importReports(listOf(exit))
        assertTrue(drain(store).isEmpty())
        assertFalse(File(store.root, "runs/${run.id}/go.log").exists())
    }

    @Test fun `live dump is not imported and source version survives sender upgrade`() {
        val store = store()
        val run = run(store)
        val handle = store.begin(run)
        store.writeJvm(handle, listOf(CrashStack("original.Error")))
        store.importReports(emptyList())
        assertTrue(drain(store).isEmpty())
        handle.close()
        val newProcessStore = CrashStore(store.root) { clock }
        newProcessStore.importReports(emptyList())
        val report = drain(newProcessStore).single()
        assertEquals("old-app", report.run.appVersion)
        assertEquals("old-core", report.run.coreVersion)
    }

    @Test fun `off deletes pending and reenabling rejects previous history`() {
        val store = store()
        val old = crash(store)
        store.importReports(emptyList())
        store.setEnabled(false)
        assertFalse(store.hasPending())
        assertFalse(store.policy().enabled)
        clock += 100
        store.setEnabled(true)
        store.importReports(listOf(CrashExit(old.id, old.pid, clock - 50, 4, "vpn_jvm_crash")))
        assertTrue(drain(store).isEmpty())
        crash(store)
        store.importReports(emptyList())
        assertEquals(1, drain(store).size)
    }

    @Test fun `unconfirmed exit and stale anr trace do not create crashes`() {
        val store = store()
        val run = run(store)
        store.begin(run).close()
        store.importReports(listOf(CrashExit(run.id, run.pid, clock, 10, null,
            stack = CrashStack("android.anr"))))
        assertTrue(drain(store).isEmpty())
    }

    @Test fun `system ANR without trace is explicit and incomplete`() {
        val store = store()
        val run = run(store)
        store.begin(run).close()
        store.importReports(listOf(CrashExit(run.id, run.pid, clock, 6, "vpn_anr")))
        val report = drain(store).single()
        assertEquals("vpn_anr", report.category)
        assertTrue(report.incomplete)
    }

    @Test fun `queue caps sixteen expires after seven days and limits each drain`() {
        val store = store()
        repeat(20) { crash(store, run(store, pid = it)) }
        store.importReports(emptyList())
        assertEquals(16, File(store.root, "queue").listFiles()!!.size)
        assertEquals(4, store.drain(4) {})
        assertEquals(12, File(store.root, "queue").listFiles()!!.size)
        clock += RETENTION_MS + 1000
        store.importReports(emptyList())
        assertFalse(store.hasPending())
    }

    @Test fun `large jvm stacks fit report bound`() {
        val store = store()
        store.begin(run(store)).use { h ->
            store.writeJvm(h, List(4) { CrashStack("Error", List(64) { CrashFrame("a".repeat(300), "b".repeat(100), 10) }) })
            assertTrue(File(h.directory, "jvm.json").length() <= MAX_REPORT_BYTES)
        }
        store.importReports(emptyList())
        assertTrue(File(store.root, "queue").listFiles()!!.single().length() <= MAX_REPORT_BYTES)
        assertTrue(drain(store).single().incomplete)
    }

    @Test fun `concurrent importers cannot submit twice`() {
        val store = store()
        crash(store)
        val ready = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val futures = (1..2).map {
                executor.submit<Int> {
                    ready.await()
                    val other = CrashStore(store.root) { clock }
                    other.importReports(emptyList())
                    other.drain(4) {}
                }
            }
            ready.countDown()
            assertEquals(1, futures.sumOf { it.get(5, TimeUnit.SECONDS) })
        } finally { executor.shutdownNow() }
    }

    @Test fun `sdk payload preserves source frames and grouping excludes id and timestamp`() {
        val store = store()
        val source = IllegalStateException("SECRET_EXCEPTION")
        source.stackTrace = arrayOf(StackTraceElement("original.Class", "call", "Original.kt", 37))
        val run = run(store)
        val report = CrashEnvelope(eventId = run.id, run = run, category = "vpn_jvm_crash",
            occurredAt = clock, stacks = CrashSanitizer.throwable(source))
        val first = CrashReportPayload.from(report)
        val second = CrashReportPayload.from(report.copy(eventId = UUID.randomUUID().toString(), occurredAt = clock + 10))
        assertEquals(first.error.stackTrace.toList(), second.error.stackTrace.toList())
        assertEquals(first.error.message, second.error.message)
        assertEquals("source.original.Class", first.error.stackTrace.single().className)
        assertEquals("old-app", first.keys["source_app_version"])
        assertFalse(first.error.stackTraceToString().contains("SECRET"))
        assertFalse(first.keys.values.any { it.contains("SECRET") })
        assertFalse(first.error.stackTraceToString().contains(run.id))
    }

    @Test fun `dump locked by another operating system process is not read`() {
        val store = store()
        val run = crash(store)
        val java = File(System.getProperty("java.home"), "bin/java").absolutePath
        val classes = File(CrashLockProbe::class.java.protectionDomain!!.codeSource.location.toURI()).absolutePath
        val process = ProcessBuilder(java, "-cp", classes, CrashLockProbe::class.java.name,
            File(store.root, "runs/${run.id}/run.lock").absolutePath).redirectErrorStream(true).start()
        try {
            assertEquals("locked", process.inputStream.bufferedReader().readLine())
            store.importReports(emptyList())
            assertFalse(store.hasPending())
            process.outputStream.write(1)
            process.outputStream.flush()
            assertTrue(process.waitFor(5, TimeUnit.SECONDS))
            store.importReports(emptyList())
            assertEquals(1, drain(store).size)
        } finally { process.destroyForcibly() }
    }

    @Test fun `process budget survives partial sink failures and repeated jobs`() {
        val store = store()
        repeat(7) { crash(store, run(store, pid = it)) }
        store.importReports(emptyList())
        var accepted = 0
        var failNext = true
        val sink = object : CrashReportSink {
            override fun setEnabled(enabled: Boolean) = Unit
            override fun deleteUnsent() = Unit
            override fun record(report: CrashEnvelope) {
                if (accepted == 1 && failNext) { failNext = false; throw IllegalStateException("transient") }
                accepted++
            }
        }
        val session = CrashDeliverySession()
        assertTrue(runCatching { session.drain(store, sink) }.isFailure)
        session.drain(store, sink)
        session.drain(store, sink)
        assertEquals(4, accepted)
        assertEquals(3, File(store.root, "queue").listFiles()!!.size)
        CrashDeliverySession().drain(store, sink)
        assertEquals(7, accepted)
    }

    @Test fun `durable handled marker wins after sender dies before queue deletion`() {
        val store = store()
        val source = crash(store)
        store.importReports(emptyList())
        File(store.root, "runs/${source.id}/handled").writeBytes(byteArrayOf(1))
        assertTrue(drain(store).isEmpty())
        assertFalse(store.hasPending())
    }

    @Test fun `late system exit keeps retry eligible without inventing a crash`() {
        val store = store()
        val run = run(store)
        store.begin(run).close()
        store.importReports(emptyList())
        assertFalse(store.hasPending())
        assertTrue(store.hasAwaitingSystemExit())
        store.importReports(listOf(CrashExit(run.id, run.pid, clock, 10, null)))
        assertFalse(store.hasAwaitingSystemExit())
        assertTrue(drain(store).isEmpty())
    }

    @Test fun `late non crash system reason cannot discard confirmed queued crash`() {
        val store = store()
        val source = crash(store)
        store.importReports(emptyList())
        store.importReports(listOf(CrashExit(source.id, source.pid, clock, 1, null)))
        val report = drain(store).single()
        assertEquals("vpn_jvm_crash", report.category)
        assertEquals(1, report.exitReason)
    }

    @Test fun `new crash of a weeks old process is not expired`() {
        val store = store()
        val source = run(store).copy(startedAt = clock - 2 * RETENTION_MS)
        crash(store, source)
        store.importReports(emptyList())
        assertEquals(1, drain(store).size)
    }

    @Test fun `weeks old process still waits for a newly published native exit`() {
        val store = store()
        val source = run(store).copy(startedAt = clock - 2 * RETENTION_MS)
        store.begin(source).close()
        store.importReports(emptyList())
        assertTrue(store.hasAwaitingSystemExit())
        store.importReports(listOf(CrashExit(source.id, source.pid, clock, 5, "vpn_native_crash")))
        assertEquals("vpn_native_crash", drain(store).single().category)
    }
}

@OptIn(ExperimentalSerializationApi::class)
@Serializable
private data class SecretTombstone(
    @ProtoNumber(6) val tid: Int,
    @ProtoNumber(10) val signal: TombstoneSignal,
    @ProtoNumber(14) val secret: String,
    @ProtoNumber(16) val threads: Map<Int, SecretThread>,
)
@OptIn(ExperimentalSerializationApi::class)
@Serializable
private data class SecretThread(
    @ProtoNumber(1) val secretName: String,
    @ProtoNumber(4) val frames: List<TombstoneFrame>,
)
