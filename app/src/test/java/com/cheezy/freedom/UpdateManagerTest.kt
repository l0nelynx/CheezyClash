package com.cheezy.freedom

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateManagerTest {

    @Test
    fun `isNewerVersion compares semver parts`() {
        assertTrue(UpdateManager.isNewerVersion("1.5.16", "1.5.15"))
        assertFalse(UpdateManager.isNewerVersion("1.5.15", "1.5.15"))
        assertFalse(UpdateManager.isNewerVersion("1.5.14", "1.5.15"))
        assertTrue(UpdateManager.isNewerVersion("2.0.0", "1.9.9"))
        assertTrue(UpdateManager.isNewerVersion("v1.6.0", "1.5.99"))
    }

    @Test
    fun `isTrustedDownloadUrl allows github https only`() {
        assertTrue(
            UpdateManager.isTrustedDownloadUrl(
                "https://github.com/l0nelynx/CheezyClash/releases/download/v1/app.apk"
            )
        )
        assertTrue(
            UpdateManager.isTrustedDownloadUrl(
                "https://objects.githubusercontent.com/github-production-release-asset/1/app.apk"
            )
        )
        assertFalse(UpdateManager.isTrustedDownloadUrl("http://github.com/x/y.apk"))
        assertFalse(UpdateManager.isTrustedDownloadUrl("https://evil.example/x.apk"))
    }
}
