import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    // Connects baselineProfile { ... } DSL. Committed profiles live in
    // src/directRelease/generated/baselineProfiles/ (shared by open + proprietary direct releases).
    // Generate: :app:generateDirectOpenReleaseBaselineProfile then promoteBaselineProfileToDirectRelease.
    alias(libs.plugins.androidx.baselineprofile)
    // Applied below only when app/google-services.json is present (see Firebase section).
    alias(libs.plugins.google.services) apply false
    alias(libs.plugins.firebase.crashlytics) apply false
}

val versionPropsFile = rootProject.file("app/version.properties")
val versionProps = Properties().apply {
    versionPropsFile.inputStream().use { load(it) }
}
val verMajor = versionProps.getProperty("VERSION_MAJOR").toInt()
val verMinor = versionProps.getProperty("VERSION_MINOR").toInt()
val verBuild = versionProps.getProperty("VERSION_BUILD").toInt()
val baseVersionCode = verMajor * 1_000_000 + verMinor * 10_000 + verBuild
val baseVersionName = "$verMajor.$verMinor.$verBuild"

val abiVersionCodeOffset = mapOf(
    "armeabi-v7a" to 1,
    "x86_64" to 3,
    "arm64-v8a" to 4,
    "universal" to 9,
)

android {
    namespace = "com.cheezy.freedom"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.cheezy.freedom"
        minSdk = 28
        targetSdk = 37
        versionCode = baseVersionCode
        versionName = baseVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    // Two dimensions:
    //  - distribution: gplay vs direct (store vs side-loading via GitHub Releases).
    //  - edition: open vs proprietary (CheezyClash without backend vs CheezyVPN with Cheezy API).
    //
    // Total: 4 SKUs × debug/release/benchmark. The proprietary.gradle.kts file
    // will be conditionally included only in the private repository —
    // src/proprietaryMain/ will also reside there. In the open repository,
    // the "proprietary" flavor is simply missing.
    flavorDimensions.addAll(listOf("distribution", "edition"))
    productFlavors {
        create("gplay") {
            dimension = "distribution"
            buildConfigField("String", "DISTRIBUTION_TYPE", "\"GPLAY\"")
        }
        create("direct") {
            dimension = "distribution"
            buildConfigField("String", "DISTRIBUTION_TYPE", "\"DIRECT\"")
        }
        create("open") {
            dimension = "edition"
            // The open version is installed ALONGSIDE the proprietary version (like the debug build) —
            // separate data dir, separate launcher icons.
            applicationIdSuffix = ".clash"
            versionNameSuffix = "-clash"
            buildConfigField("String", "EDITION", "\"OPEN\"")
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = true
        }
    }

    buildTypes {
        debug {
            // Debug build is installed ALONGSIDE release: applicationId gets a ".debug" suffix,
            // versionName gets a "-debug" suffix. This means:
            //  - Both versions can coexist on the device (different icons).
            //  - They have separate data dirs → SharedPrefs / cache / config.yaml don't intersect.
            //  - FileProvider authority automatically becomes "com.cheezy.freedom.debug.fileprovider"
            //    (AndroidManifest uses ${applicationId}.fileprovider — AGP handles this).
            //  - AIDL action string "com.cheezy.freedom.clash.IClashInterface" is a hardcoded constant,
            //    UI ↔ :vpn binding happens through it within one process tree — suffix doesn't affect this.
            //
            // app_name is overridden in src/debug/res/values/strings.xml as "CheezyVPN Debug"
            // so the launcher icon is distinct. resValue is not used here to avoid
            // creating resources for every build.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )

            // Signing configuration from environment variables (for CI)
            val keyStoreFile = rootProject.file("release.jks")
            if (System.getenv("KEY_STORE_PASSWORD") != null && keyStoreFile.exists()) {
                signingConfig = signingConfigs.create("release") {
                    storeFile = keyStoreFile
                    storePassword = System.getenv("KEY_STORE_PASSWORD")
                    keyAlias = System.getenv("KEY_ALIAS")
                    keyPassword = System.getenv("KEY_PASSWORD")
                }
            }
        }
        // Build type for running Macrobenchmark tests that generate baseline-prof.
        // Must be NOT debuggable (otherwise ART won't JIT → measurements will be inaccurate),
        // but profileable (otherwise the benchmark cannot read performance traces).
        create("benchmark") {
            initWith(buildTypes.getByName("release"))
            // benchmark buildType inherits release settings but is signed with the
            // debug key (the release key is usually absent in CI/dev). On a real device,
            // the profile is installed via adb install anyway.
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            isDebuggable = false
            isProfileable = true
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
        aidl = true
    }
    packaging {
        jniLibs {
            useLegacyPackaging = false
        }
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

// Shared Baseline Profile for direct*Release (open + proprietary).
//
// Profiles live in src/directRelease/generated/baselineProfiles/ so AGP merges them
// into both directOpenRelease and directProprietaryRelease (shared com.cheezy.freedom.* DEX).
// Generate against open only, then promote:
//   ./gradlew :app:generateDirectOpenReleaseBaselineProfile
//   ./gradlew :app:promoteBaselineProfileToDirectRelease
// Gplay variants intentionally have no local profile (Play Cloud Profile).
baselineProfile {
    automaticGenerationDuringBuild = false
}

tasks.register<Copy>("promoteBaselineProfileToDirectRelease") {
    group = "baseline profile"
    description =
        "Copy profiles from directOpenRelease (plugin output) into shared directRelease source set"
    from("src/directOpenRelease/generated/baselineProfiles")
    into("src/directRelease/generated/baselineProfiles")
    include("baseline-prof.txt", "startup-prof.txt")
    doLast {
        val dest = file("src/directRelease/generated/baselineProfiles")
        check(dest.resolve("baseline-prof.txt").exists()) {
            "baseline-prof.txt missing after promote — run generateDirectOpenReleaseBaselineProfile first"
        }
        println("Promoted baseline profiles → ${dest.invariantSeparatorsPath}")
    }
}

androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            val abi = (output as? com.android.build.api.variant.VariantOutput)
                ?.filters
                ?.find { it.filterType == com.android.build.api.variant.FilterConfiguration.FilterType.ABI }
                ?.identifier
                ?: "universal"
            val offset = abiVersionCodeOffset[abi] ?: 0
            output.versionCode.set(baseVersionCode * 10 + offset)
            output.versionName.set("$baseVersionName-$abi")
        }
    }
}

tasks.register("bumpVersionBuild") {
    group = "versioning"
    description = "Increment VERSION_BUILD in app/version.properties"
    doLast {
        val current = versionProps.getProperty("VERSION_BUILD").toInt()
        versionProps.setProperty("VERSION_BUILD", (current + 1).toString())
        versionPropsFile.outputStream().use {
            versionProps.store(it, "Auto-bumped by bumpVersionBuild")
        }
        println("VERSION_BUILD: $current -> ${current + 1}")
    }
}

tasks.matching { it.name == "preBuild" }.configureEach {
    val isCI = System.getenv("GITHUB_ACTIONS") == "true"
    if (!isCI && gradle.startParameter.taskNames.any { it.contains("assembleRelease", ignoreCase = true) || it.contains("bundleRelease", ignoreCase = true) }) {
        dependsOn("bumpVersionBuild")
    }
}

// Generate against open, then promote into shared directRelease (covers open + proprietary):
//   ./gradlew :app:generateDirectOpenReleaseBaselineProfile
//   ./gradlew :app:promoteBaselineProfileToDirectRelease
dependencies {
    baselineProfile(project(":baselineprofile"))
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material3.adaptive.navigation.suite)
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.graphics.shapes)
    // ProfileInstaller is a runtime component; it reads META-INF/baseline.prof from the APK
    // and requests ART to apply it (via dexopt on API 28+). Without it, baseline-prof
    // will be in the APK, but ART won't pick it up at startup.
    implementation(libs.androidx.profileinstaller)
    // androidx.startup — initialization provider before Application.onCreate.
    // Used for binding account/subscription providers in AppDeps depending
    // on the flavor (open / proprietary), so that main code can access AppDeps.*
    // without knowing the specific implementation.
    implementation(libs.androidx.startup.runtime)
    implementation("com.google.zxing:core:3.5.3")
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.snakeyaml)
    testImplementation(libs.junit)
    testImplementation(libs.snakeyaml)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

// Apply the proprietary overlay if present (private builds only). The path may be
// supplied via -PproprietaryGradle=<abs path> so this public repo can be consumed
// as a git submodule of the private repo without copying any proprietary files into
// the working tree. Falls back to an in-tree app/proprietary.gradle (legacy layout).
// When neither exists (public builds), the "proprietary" flavor is simply absent.
run {
    val overlay = (findProperty("proprietaryGradle") as String?)
        ?.let { file(it) }
        ?: file("proprietary.gradle")
    if (overlay.exists()) apply(from = overlay)
}

// Firebase: google-services + Crashlytics require app/google-services.json
// (merged clients for com.cheezy.freedom.clash and com.cheezy.freedom).
// See google-services.json.example and README. Without the file, Firebase is omitted
// so CI/local builds still succeed.
val googleServicesJson = file("google-services.json")
if (googleServicesJson.exists()) {
    apply(plugin = "com.google.gms.google-services")
    apply(plugin = "com.google.firebase.crashlytics")
    dependencies {
        implementation(platform(libs.firebase.bom))
        implementation(libs.firebase.analytics)
        implementation(libs.firebase.crashlytics)
    }
} else {
    logger.warn(
        "app/google-services.json missing — Firebase Analytics/Crashlytics disabled. " +
            "Copy google-services.json.example → google-services.json from Firebase Console."
    )
}
