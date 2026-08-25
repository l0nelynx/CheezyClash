package com.cheezy.freedom.ui.main

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeSnapshotGuardTest {
    @Test
    fun `snapshot is accepted for the profile that requested it`() {
        assertTrue(isCurrentProfileSnapshot("profile-a", "profile-a"))
        assertTrue(isCurrentProfileSnapshot(null, null))
    }

    @Test
    fun `snapshot is rejected after active profile changes`() {
        assertFalse(isCurrentProfileSnapshot("profile-a", "profile-b"))
        assertFalse(isCurrentProfileSnapshot("profile-a", null))
        assertFalse(isCurrentProfileSnapshot(null, "profile-b"))
    }
}
