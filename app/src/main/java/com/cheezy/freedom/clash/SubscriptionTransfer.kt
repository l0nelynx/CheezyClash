package com.cheezy.freedom.clash

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.io.OutputStream
import java.io.IOException
import java.net.HttpURLConnection
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal object SubscriptionTransfer {
    suspend fun <T> read(connection: HttpURLConnection, block: (checkActive: () -> Unit) -> T): T = withContext(Dispatchers.IO) {
        suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { runCatching { connection.disconnect() } }
            try {
                val result = block { if (!continuation.isActive) throw CancellationException("Download cancelled") }
                continuation.resume(result)
            } catch (error: Exception) {
                if (continuation.isActive) continuation.resumeWithException(error)
            } finally { connection.disconnect() }
        }
    }

    fun copyLimited(input: InputStream, output: OutputStream, limit: Long, checkActive: () -> Unit = {}) {
        val buffer = ByteArray(8192)
        var copied = 0L
        while (true) {
            checkActive()
            val count = input.read(buffer)
            if (count < 0) return
            copied += count
            if (copied > limit) throw IOException("Subscription exceeded size limit ($limit bytes)")
            output.write(buffer, 0, count)
        }
    }
}
