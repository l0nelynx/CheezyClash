package com.cheezy.freedom.baselineprofile

import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.junit4.BaselineProfileRule
import org.junit.Rule
import org.junit.Test

/**
 * Baseline Profile generator for CheezyClash / CheezyVPN shared UI.
 *
 * Generate once against the **open** app (`com.cheezy.freedom.clash`), then promote
 * the output into `app/src/directRelease/generated/baselineProfiles/` so both
 * `directOpenRelease` and `directProprietaryRelease` pick it up (shared DEX).
 *
 * Run:
 *   ./gradlew :app:generateDirectOpenReleaseBaselineProfile
 *   ./gradlew :app:promoteBaselineProfileToDirectRelease
 *
 * Single collect block (every iteration does the full path — easy to see on device):
 * grant notifications → cold start → wait for UrlDialog → Back → wait → swipe pager.
 */
class BaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() = rule.collect(
        packageName = PACKAGE_NAME,
        includeInStartupProfile = true,
    ) {
        device.executeShellCommand(
            "pm grant $PACKAGE_NAME android.permission.POST_NOTIFICATIONS"
        )
        pressHome()
        startActivityAndWait()

        // UrlDialog is shown asynchronously after bootstrap — wait, then one Back.
        Thread.sleep(DIALOG_APPEAR_MS)
        device.pressBack()
        Thread.sleep(POST_BACK_WAIT_MS)

        // HorizontalPager: Home → Proxies → Profiles → Settings → back to Home.
        repeat(3) { swipePager(left = true) }
        repeat(3) { swipePager(left = false) }
    }

    private fun MacrobenchmarkScope.swipePager(left: Boolean) {
        val w = device.displayWidth
        val h = device.displayHeight
        // Upper half of the screen = page card (floating nav sits at the bottom).
        val y = (h * 0.35f).toInt()
        val leftX = (w * 0.10f).toInt()
        val rightX = (w * 0.90f).toInt()
        if (left) {
            device.swipe(rightX, y, leftX, y, SWIPE_STEPS)
        } else {
            device.swipe(leftX, y, rightX, y, SWIPE_STEPS)
        }
        device.waitForIdle()
        Thread.sleep(TAB_SETTLE_MS)
    }

    companion object {
        private const val PACKAGE_NAME = "com.cheezy.freedom.clash"
        private const val DIALOG_APPEAR_MS = 2_000L
        private const val POST_BACK_WAIT_MS = 5_000L
        private const val TAB_SETTLE_MS = 600L
        /** More steps = slower swipe; HorizontalPager ignores too-fast flicks. */
        private const val SWIPE_STEPS = 60
    }
}
