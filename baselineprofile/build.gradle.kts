// Test Gradle module for generating Baseline Profiles via Macrobenchmark.
// Not included in the production APK. Run via:
//   ./gradlew :app:generateDirectOpenReleaseBaselineProfile
//   ./gradlew :app:promoteBaselineProfileToDirectRelease
//
// Plugin writes under src/directOpenRelease/...; promote copies into the shared
// src/directRelease/generated/baselineProfiles/ source set (open + proprietary).
// Commit those files — release builds pack them into META-INF/baseline.prof.

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
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Matches :app — otherwise the baselineProfile plugin won't match variants.
    flavorDimensions += listOf("distribution", "edition")
    productFlavors {
        create("gplay") { dimension = "distribution" }
        create("direct") { dimension = "distribution" }
        // Generation runs against open only; proprietary flavor exists for variant matching
        // when the private overlay is applied. Shared profile covers proprietary DEX via
        // app/src/directRelease/.
        create("open") { dimension = "edition" }
        create("proprietary") { dimension = "edition" }
    }

    buildTypes {
        create("benchmark") {
            isDebuggable = true
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
        }
    }

    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true
}

baselineProfile {
    useConnectedDevices = true
}

dependencies {
    implementation(libs.androidx.benchmark.macro.junit4)
    implementation(libs.androidx.uiautomator)
    implementation(libs.junit)
}
