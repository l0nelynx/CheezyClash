package com.cheezy.freedom.clash

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import org.yaml.snakeyaml.Yaml

internal object ConfigFiles {
    fun readValidated(file: File): Map<String, Any?> {
        val value = file.reader().use { Yaml().load<Any?>(it) }
        if (value !is Map<*, *> || value.isEmpty() || value.keys.any { it !is String }) {
            throw IOException("Subscription must contain a YAML configuration object")
        }
        @Suppress("UNCHECKED_CAST")
        return value as Map<String, Any?>
    }

    fun writeAtomically(target: File, text: String) {
        val temporary = File.createTempFile(target.name, ".tmp", target.parentFile)
        try {
            FileOutputStream(temporary).use { output ->
                output.write(text.toByteArray(Charsets.UTF_8))
                output.fd.sync()
            }
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } finally { temporary.delete() }
    }
}
