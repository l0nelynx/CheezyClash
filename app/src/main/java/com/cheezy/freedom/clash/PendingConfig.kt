package com.cheezy.freedom.clash

import java.io.File
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.StandardCopyOption
import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext

/** Inherited by backend gateway calls inside the worker, without changing its API. */
internal object DeferProfileUpdates : AbstractCoroutineContextElement(Key) {
    object Key : CoroutineContext.Key<DeferProfileUpdates>
}

internal object PendingConfig {
    fun directory(profileDir: File): File = profileDir.resolve("pending")
    fun discard(profileDir: File) { directory(profileDir).resolve("base.yaml").delete() }
    fun promote(profileDir: File): Boolean {
        val source = directory(profileDir).resolve("base.yaml")
        try {
            // Both files are on the same filesystem. A later download remains pending.
            Files.move(source.toPath(), profileDir.resolve("base.yaml").toPath(),
                StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            return true
        } catch (_: NoSuchFileException) { return false }
    }
}
