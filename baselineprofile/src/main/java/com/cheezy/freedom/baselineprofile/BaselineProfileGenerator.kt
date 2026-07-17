package com.cheezy.freedom.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test

/**
 * Baseline Profile generator for CheezyVPN.
 *
 * Run via:
 *   ./gradlew :app:generateDirectBenchmarkBaselineProfile
 *
 * Scenario:
 *  1. App cold-start (the main part — records everything needed for launch).
 *  2. Click through tabs: Home → Proxies → Settings → Home.
 *
 * Navigation note: the bottom nav shows a text label only on the *active* tab,
 * so inactive tabs can't be matched by `By.text`. Every nav icon carries a
 * contentDescription equal to its title, so we navigate by `By.desc(...)`,
 * which works regardless of which tab is selected.
 *
 * Does NOT cover:
 *  - Real network operations (auth, importFromUrl) — too fragile in CI.
 *  - System VPN-permission dialog (system_app, not ours).
 *  - Binding to the :vpn process — it only starts when Connect is pressed, which
 *    requires notif-permission + VPN-permission. The test environment usually
 *    doesn't grant either. If you want to cover the VPN flow, you need to separately
 *    setup UiAutomator and grant system permissions via `adb shell pm grant`
 *    before running.
 */
// Without @RunWith — BaselineProfileRule initializes the JUnit4 runner itself.
// AndroidJUnit4 lives in androidx.test.ext:junit and is not pulled in here
// (Macrobenchmark and BaselineProfileRule only pull what is needed).
class BaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() = rule.collect(
        packageName = PACKAGE_NAME,
        includeInStartupProfile = true
    ) {
        // pressHome before startActivityAndWait guarantees a cold-start
        // (rather than a warm one if a previous iteration left the process alive).
        pressHome()
        startActivityAndWait()

        // Give MainScreen time for its first composition. The bottom-nav icons
        // are always present and carry their title as contentDescription.
        device.wait(Until.hasObject(By.desc("Главная")), 5_000)

        // Clicking through tabs is the most effective way to load the Composable
        // classes of all screens into the profile. Navigate by contentDescription
        // (labels only render on the active tab).
        device.findObject(By.desc("Правила"))?.click()
        device.waitForIdle()

        device.findObject(By.desc("Настройки"))?.click()
        // "Информация" is a settings row present in every flavor (unlike the
        // account card, which only exists in the proprietary build).
        device.wait(Until.hasObject(By.text("Информация")), 2_000)

        device.findObject(By.desc("Главная"))?.click()
        device.waitForIdle()
    }

    companion object {
        // applicationId must match :app; flavor direct/gplay = same id.
        private const val PACKAGE_NAME = "com.cheezy.freedom.clash"
    }
}
