package com.cheezy.freedom

import org.junit.Assert.*
import org.junit.Test

class LogPrivacyTest {
    @Test fun `display and export redact urls and credentials`() {
        val text = "https://host/sub/TOKEN password=PASS secret=SECRET uuid=UUID 192.168.1.2\nAuthorization: Bearer AUTH"
        val redacted = LogPrivacy.redact(text)
        listOf("TOKEN", "PASS", "SECRET", "UUID", "192.168.1.2", "AUTH").forEach { assertFalse(redacted.contains(it)) }
        assertEquals(redacted, LogPrivacy.redact(redacted))
    }
}
