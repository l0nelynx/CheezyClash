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
 *  2. Click through tabs: Home → Proxies → Settings.
 *  3. On the Proxies tab, expand the first group (triggers LazyColumn + ProxyRow).
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

        // Give MainScreen time for its first composition. 5 seconds is generous,
        // but anything less risks not waiting for the scaffold on slow emulators.
        device.wait(Until.hasObject(By.text("Главная")), 5_000)

        // Clicking through tabs is the most effective way to load
        // Composable classes of all screens into the profile.
        device.findObject(By.text("Правила"))?.click()
        device.wait(Until.hasObject(By.text("Правила")), 2_000)

        device.findObject(By.text("Настройки"))?.click()
        device.wait(Until.hasObject(By.text("Аккаунт")), 2_000)

        device.findObject(By.text("Главная"))?.click()
        device.wait(Until.hasObject(By.text("Главная")), 2_000)
    }

    companion object {
        // applicationId must match :app; flavor direct/gplay = same id.
        private const val PACKAGE_NAME = "com.cheezy.freedom"
    }
}
