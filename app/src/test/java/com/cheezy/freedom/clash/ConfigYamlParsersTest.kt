package com.cheezy.freedom.clash

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConfigYamlParsersTest {

    @Test
    fun `parseFilename extracts quoted name`() {
        assertEquals(
            "sub.yaml",
            ConfigYamlParsers.parseFilename("attachment; filename=\"sub.yaml\""),
        )
    }

    @Test
    fun `parseFilename returns null for blank`() {
        assertNull(ConfigYamlParsers.parseFilename(null))
        assertNull(ConfigYamlParsers.parseFilename(""))
    }

    @Test
    fun `decodeMaybeBase64 decodes prefix`() {
        val encoded = "base64:SGVsbG8="
        assertEquals("Hello", ConfigYamlParsers.decodeMaybeBase64(encoded))
    }

    @Test
    fun `decodeMaybeBase64 passes through plain text`() {
        assertEquals("plain", ConfigYamlParsers.decodeMaybeBase64("plain"))
    }

    @Test
    fun `mergeUserInfo parses subscription-userinfo`() {
        val base = SubscriptionInfo()
        val merged = ConfigYamlParsers.mergeUserInfo(
            base,
            "upload=1; download=2; total=10; expire=1700000000",
        )
        assertEquals(1L, merged.upload)
        assertEquals(2L, merged.download)
        assertEquals(10L, merged.total)
        assertEquals(1700000000L, merged.expire)
    }

    @Test
    fun `computeEffectiveExcludePackages respects force include exclude`() {
        val result = ConfigYamlParsers.computeEffectiveExcludePackages(
            base = listOf("a", "b", "c"),
            enabled = true,
            forceIncluded = setOf("b"),
            forceExcluded = setOf("d"),
        )
        assertTrue(result.contains("a"))
        assertTrue(result.contains("c"))
        assertTrue(result.contains("d"))
        assertTrue(!result.contains("b"))
    }

    @Test
    fun `computeEffectiveExcludePackages disabled returns base`() {
        val base = listOf("a", "b")
        assertEquals(
            base,
            ConfigYamlParsers.computeEffectiveExcludePackages(
                base = base,
                enabled = false,
                forceIncluded = setOf("a"),
                forceExcluded = setOf("z"),
            ),
        )
    }
}
