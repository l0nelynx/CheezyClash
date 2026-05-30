package com.github.kr328.clash.core.bridge

import android.net.Uri
import androidx.annotation.Keep
import java.io.FileNotFoundException

@Keep
object Content {
    @JvmStatic
    fun open(url: String): Int {
        val uri = Uri.parse(url)

        if (uri.scheme != "content") {
            throw UnsupportedOperationException("Unsupported scheme ${uri.scheme}")
        }

        val ctx = Bridge.appContext
            ?: throw IllegalStateException("Bridge.attachContext() must be called before opening content:// URIs")

        return ctx.contentResolver.openFileDescriptor(uri, "r")?.detachFd()
            ?: throw FileNotFoundException("$uri not found")
    }
}
