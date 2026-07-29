package com.cheezy.freedom.ui.main.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProxyNamePresentationTest {
    @Test
    fun `extracts country flag and cleans display name`() {
        val result = "🇩🇪 Germany 01".toProxyNamePresentation()

        assertEquals("🇩🇪", result.flag)
        assertEquals("Germany 01", result.displayName)
    }

    @Test
    fun `accepts whitespace before flag`() {
        val result = "  🇳🇱 Amsterdam".toProxyNamePresentation()

        assertEquals("🇳🇱", result.flag)
        assertEquals("Amsterdam", result.displayName)
    }

    @Test
    fun `keeps optional variation selector in extracted flag`() {
        val result = "🇺🇸\uFE0F New York".toProxyNamePresentation()

        assertEquals("🇺🇸\uFE0F", result.flag)
        assertEquals("New York", result.displayName)
    }

    @Test
    fun `name without flag stays unchanged`() {
        val source = "Amsterdam Premium"
        val result = source.toProxyNamePresentation()

        assertNull(result.flag)
        assertEquals(source, result.displayName)
    }

    @Test
    fun `arbitrary emoji is not treated as country flag`() {
        val source = "🌐 Global Auto"
        val result = source.toProxyNamePresentation()

        assertNull(result.flag)
        assertEquals(source, result.displayName)
    }

    @Test
    fun `flag-only name stays unchanged to avoid empty label`() {
        val source = "🇫🇷  "
        val result = source.toProxyNamePresentation()

        assertNull(result.flag)
        assertEquals(source, result.displayName)
    }

    @Test
    fun `only flag and following whitespace are removed`() {
        val result = "🇯🇵   | Tokyo".toProxyNamePresentation()

        assertEquals("🇯🇵", result.flag)
        assertEquals("| Tokyo", result.displayName)
    }
}
