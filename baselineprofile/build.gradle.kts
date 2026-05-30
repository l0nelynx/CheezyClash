// Test Gradle module for generating Baseline Profiles via Macrobenchmark.
// Not included in the production APK. Run via:
//   ./gradlew :app:generateDirectBenchmarkBaselineProfile
// AGP will automatically raise the benchmark build of the application,
// install it on the device, run the script below, collect baseline-prof.txt,
// and place it in app/src/directRelease/generated/baselineProfiles/.
//
// The resulting file should be checked into git and committed — subsequent
// release builds will automatically compile it into the APK without regeneration.

plugins {
    // AGP 9 has built-in Kotlin support; applying kotlin.android is NOT necessary.
    // See https://kotl.in/gradle/agp-built-in-kotlin
    alias(libs.plugins.android.test)
    alias(libs.plugins.androidx.baselineprofile)
}

android {
    namespace = "com.cheezy.freedom.baselineprofile"
    compileSdk = 37

    defaultConfig {
        minSdk = 28
        targetSdk = 37
        // AndroidJUnitRunner is suitable — Macrobenchmark inherits it.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Matches :app — otherwise the baselineProfile plugin won't match variants.
    flavorDimensions += listOf("distribution", "edition")
    productFlavors {
        create("gplay") { dimension = "distribution" }
        create("direct") { dimension = "distribution" }
        // edition: benchmark is only needed for the proprietary build (main flow +
        // AuthActivity at start). The open version isn't published to Play anyway,
        // so it needs baseline-prof less. Nevertheless, we declare both to avoid
        // breaking variant matching.
        create("open") { dimension = "edition" }
        create("proprietary") { dimension = "edition" }
    }

    buildTypes {
        // The benchmark targets the application's benchmark buildType (profileable=true).
        create("benchmark") {
            isDebuggable = true
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
        }
    }

    // Specify which app variant we are testing — direct(benchmark).
    // We don't profile the gplay variant (see repo README / comment in app/build.gradle.kts).
    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true
}

// AGP baselineProfile configuration: where to save intermediate results,
// how strictly to filter data, etc. Default values work, but
// useConnectedDevices=true is important for the emulator (by default AGP
// tries to spin up a Gradle Managed Device).
baselineProfile {
    useConnectedDevices = true
}

dependencies {
    implementation(libs.androidx.benchmark.macro.junit4)
    implementation(libs.androidx.uiautomator)
    // junit is needed for the Macrobenchmark JUnit4 runner.
    implementation(libs.junit)
}
