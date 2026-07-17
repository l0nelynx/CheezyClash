package com.cheezy.freedom.ui.main

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeepLinkParserTest {

    @Test
    fun `add link plain url`() {
        val link = parseDeepLink("cheezy://add/https://example.com/sub")
        assertEquals(DeepLink.Add("https://example.com/sub"), link)
    }

    @Test
    fun `add link percent-encoded url`() {
        val link = parseDeepLink("cheezy://add/https%3A%2F%2Fexample.com%2Fsub%3Ftoken%3Dabc")
        assertEquals(DeepLink.Add("https://example.com/sub?token=abc"), link)
    }

    @Test
    fun `plus is preserved not turned into space`() {
        val link = parseDeepLink("cheezy://add/https://e.com/s?t=a+b")
        assertEquals(DeepLink.Add("https://e.com/s?t=a+b"), link)
    }

    @Test
    fun `login link`() {
        val link = parseDeepLink("cheezy://login/tok3n")
        assertEquals(DeepLink.Login("tok3n"), link)
    }

    @Test
    fun `unknown host is null`() {
        assertNull(parseDeepLink("cheezy://open/whatever"))
    }

    @Test
    fun `http add link is rejected`() {
        assertNull(parseDeepLink("cheezy://add/http://example.com/sub"))
    }

    @Test
    fun `foreign scheme is null`() {
        assertNull(parseDeepLink("https://example.com/add/x"))
    }

    @Test
    fun `blank and null are null`() {
        assertNull(parseDeepLink(null))
        assertNull(parseDeepLink(""))
        assertNull(parseDeepLink("cheezy://add/"))
        assertNull(parseDeepLink("cheezy://login/"))
    }
}
