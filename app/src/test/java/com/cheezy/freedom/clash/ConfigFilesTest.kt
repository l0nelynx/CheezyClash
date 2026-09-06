package com.cheezy.freedom.clash

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class ConfigFilesTest {
    @Test fun `invalid subscription cannot replace working config`() {
        val dir = Files.createTempDirectory("config-validation-").toFile()
        try {
            val config = dir.resolve("config.yaml").apply { writeText("mixed-port: 7890") }
            listOf("<html>error</html>", "[a, b]", "", "proxies: [").forEach { malformed ->
                dir.resolve("base.yaml").writeText(malformed)
                assertTrue(runCatching { ConfigOverrideManager.rebuildInDir(dir, emptySet()) }.isFailure)
                assertEquals("mixed-port: 7890", config.readText())
            }
        } finally { dir.deleteRecursively() }
    }
    @Test fun `atomic replacement leaves no partial files`() {
        val dir = Files.createTempDirectory("config-write-").toFile()
        try {
            val target = dir.resolve("config.yaml").apply { writeText("old") }
            ConfigFiles.writeAtomically(target, "mixed-port: 7891")
            assertEquals(7891, ConfigFiles.readValidated(target)["mixed-port"])
            assertEquals(listOf("config.yaml"), dir.list()!!.toList())
        } finally { dir.deleteRecursively() }
    }
}
