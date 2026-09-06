package com.cheezy.freedom.clash

import com.cheezy.freedom.account.SubscriptionSnapshot
import org.junit.Assert.*
import org.junit.Test

class SubscriptionPresentationTest {
    private val yaml = SubscriptionInfo(title = "External", upload = 1, download = 2, total = 100, expire = 200, tag = "tag", announce = "news")
    private val snapshot = SubscriptionSnapshot("Account", 17, 900, 1000, true)
    @Test fun `external subscriptions retain their own totals`() {
        val profile = Profile(id = "test", name = "Test", subscription = yaml)
        assertEquals(yaml, subscriptionForProfile(profile, snapshot))
    }
    @Test fun `managed display retains tag and announcement without mutating source`() {
        val profile = Profile(id = "managed-primary", name = "Test", subscription = yaml, managed = true, managedKey = "primary")
        val shown = subscriptionForProfile(profile, snapshot)!!
        assertEquals(17L, shown.upload + shown.download)
        assertEquals("tag", shown.tag)
        assertEquals("news", shown.announce)
        assertEquals(100L, profile.subscription!!.total)
        assertEquals(yaml, subscriptionForProfile(profile.copy(managedKey = "other"), snapshot))
        assertEquals(yaml, subscriptionForProfile(profile, null))
        assertNull(subscriptionForProfile(null, snapshot))
    }
}
