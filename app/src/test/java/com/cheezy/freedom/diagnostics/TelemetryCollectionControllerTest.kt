package com.cheezy.freedom.diagnostics

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class TelemetryCollectionControllerTest {
    @get:Rule val temp = TemporaryFolder()
    private val calls = mutableListOf<String>()
    private val controller = TelemetryCollectionController(
        setAnalyticsEnabled = { calls += "analytics:$it" },
        setCrashlyticsEnabled = { calls += "crashlytics:$it" },
        resetAnalyticsData = { calls += "resetAnalytics" },
    )

    @Test fun `new installation enables both SDKs without clearing analytics`() {
        val store = CrashStore(temp.newFolder())
        controller.setEnabled(store.initializePolicy().enabled)
        assertEquals(listOf("analytics:true", "crashlytics:true"), calls)
    }

    @Test fun `off stops both collections before clearing analytics`() {
        controller.setEnabled(false)
        assertEquals(listOf("analytics:false", "crashlytics:false", "resetAnalytics"), calls)
    }

    @Test fun `previous crash reporting opt out also disables analytics after upgrade and restart`() {
        val root = temp.newFolder()
        val previousStore = CrashStore(root)
        previousStore.initializePolicy()
        val previousPolicy = previousStore.setEnabled(false)

        val restartedStore = CrashStore(root)
        val restoredPolicy = restartedStore.initializePolicy()
        controller.setEnabled(restoredPolicy.enabled)

        assertEquals(previousPolicy, restoredPolicy)
        assertEquals(listOf("analytics:false", "crashlytics:false", "resetAnalytics"), calls)
    }

    @Test fun `reenabling starts new diagnostic period and enables both SDKs`() {
        val store = CrashStore(temp.newFolder())
        store.initializePolicy()
        val disabled = store.setEnabled(false)
        controller.setEnabled(disabled.enabled)
        val enabled = store.setEnabled(true)
        controller.setEnabled(enabled.enabled)

        assertNotEquals(disabled.epoch, enabled.epoch)
        assertEquals(listOf("analytics:false", "crashlytics:false", "resetAnalytics",
            "analytics:true", "crashlytics:true"), calls)
    }

    @Test fun `invalid stored policy fails closed for both SDKs`() {
        val root = temp.newFolder()
        CrashStore.atomicWrite(File(root, "policy.json"), "{broken".toByteArray())
        val policy = CrashStore(root).initializePolicy()
        controller.setEnabled(policy.enabled)

        assertFalse(policy.enabled)
        assertEquals(listOf("analytics:false", "crashlytics:false", "resetAnalytics"), calls)
    }
}
