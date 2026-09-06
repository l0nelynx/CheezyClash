package com.cheezy.freedom.clash

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class PendingConfigTest {
    @Test fun `background download remains isolated until explicit promotion`() {
        val dir = Files.createTempDirectory("pending-profile-").toFile()
        try {
            dir.resolve("base.yaml").writeText("old")
            val pending = PendingConfig.directory(dir).apply { mkdirs() }.resolve("base.yaml")
            pending.writeText("new")
            assertEquals("old", dir.resolve("base.yaml").readText())
            assertTrue(PendingConfig.promote(dir))
            assertEquals("new", dir.resolve("base.yaml").readText())
            assertFalse(PendingConfig.promote(dir))
            pending.writeText("newer")
            assertEquals("new", dir.resolve("base.yaml").readText())
            PendingConfig.discard(dir)
            assertFalse(PendingConfig.promote(dir))
        } finally { dir.deleteRecursively() }
    }
}
