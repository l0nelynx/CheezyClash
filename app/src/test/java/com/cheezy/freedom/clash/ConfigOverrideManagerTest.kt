package com.cheezy.freedom.clash

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.yaml.snakeyaml.Yaml
import java.io.File
import java.nio.file.Files

class ConfigOverrideManagerTest {

    private fun tmpClashDir(): File {
        val dir = Files.createTempDirectory("cheezy-clash-").toFile()
        return File(dir, "clash").apply { mkdirs() }
    }

    private fun writeBase(dir: File, yaml: String): File {
        val f = File(dir, ConfigOverrideManager.BASE_FILE_NAME)
        f.writeText(yaml)
        return f
    }

    private fun parse(file: File): Map<String, Any?> =
        @Suppress("UNCHECKED_CAST")
        Yaml().load<Map<String, Any?>>(file.readText())

    @Test
    fun `rebuild copies base to config when no overrides enabled`() {
        val clash = tmpClashDir()
        writeBase(clash, """
            mixed-port: 7890
            proxies: []
        """.trimIndent())

        ConfigOverrideManager.rebuildInDir(clash, enabledIds = emptySet())

        val out = parse(File(clash, ConfigOverrideManager.CONFIG_FILE_NAME))
        assertEquals(7890, out["mixed-port"])
        assertEquals(emptyList<Any>(), out["proxies"])
        assertFalse("allow-lan must be absent", out.containsKey("allow-lan"))
    }

    @Test
    fun `rebuild applies local-proxy override when enabled`() {
        val clash = tmpClashDir()
        writeBase(clash, """
            mixed-port: 7890
            proxies:
              - name: example
                type: direct
        """.trimIndent())

        ConfigOverrideManager.rebuildInDir(clash, enabledIds = setOf(LocalProxyOverride.id))

        val out = parse(File(clash, ConfigOverrideManager.CONFIG_FILE_NAME))
        assertEquals(2080, out["mixed-port"])
        assertEquals(true, out["allow-lan"])
        assertEquals(emptyList<String>(), out["authentication"])
        @Suppress("UNCHECKED_CAST")
        val ips = out["lan-allowed-ips"] as List<String>
        assertTrue(ips.contains("192.168.0.0/16"))
        // Unrelated keys survive
        assertTrue(out.containsKey("proxies"))
    }

    @Test
    fun `rebuild restores original values when overrides disabled again`() {
        val clash = tmpClashDir()
        val baseText = """
            mixed-port: 7890
            allow-lan: false
            proxies: []
        """.trimIndent()
        writeBase(clash, baseText)

        // Enable, then disable
        ConfigOverrideManager.rebuildInDir(clash, enabledIds = setOf(LocalProxyOverride.id))
        ConfigOverrideManager.rebuildInDir(clash, enabledIds = emptySet())

        val out = parse(File(clash, ConfigOverrideManager.CONFIG_FILE_NAME))
        assertEquals(7890, out["mixed-port"])
        assertEquals(false, out["allow-lan"])
        assertFalse(out.containsKey("lan-allowed-ips"))
        assertFalse(out.containsKey("authentication"))
    }

    @Test
    fun `rebuild is a no-op when base does not exist`() {
        val clash = tmpClashDir()

        ConfigOverrideManager.rebuildInDir(clash, enabledIds = setOf(LocalProxyOverride.id))

        assertFalse(File(clash, ConfigOverrideManager.CONFIG_FILE_NAME).exists())
    }
}
