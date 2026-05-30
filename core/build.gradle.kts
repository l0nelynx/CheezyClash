import org.gradle.internal.os.OperatingSystem
import java.io.File
import java.util.Properties

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.cheezy.freedom.core"
    compileSdk = 37
    ndkVersion = "28.2.13676358"

    defaultConfig {
        minSdk = 28
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
        externalNativeBuild {
            cmake {
                abiFilters("arm64-v8a", "armeabi-v7a", "x86_64")
                arguments("-DANDROID_STL=none")
            }
        }
        consumerProguardFiles("consumer-rules.pro")
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
}

// ============================================================================
// Build libclash.so from Go sources (mihomo + CMFA wrapper).
// Our equivalent of the com.github.kr328.golang gradle plugin — without dependency
// on the Maven repo, which doesn't work with Gradle 9. Does the same: runs
// `go build -buildmode=c-shared` with the correct CC from NDK for each ABI.
// ============================================================================

data class GoAbi(
    val androidAbi: String,
    val clangTriple: String,  // clang-wrapper name in the NDK toolchain
    val goArch: String,
    val goArm: String?,        // only for armv7
)

val goAbis = listOf(
    // API level in clang-wrapper matches minSdk = 28; cannot be lower
    // (mihomo calls APIs introduced in Android 7 / API 24+).
    GoAbi("arm64-v8a",   "aarch64-linux-android28-clang",    "arm64", null),
    GoAbi("armeabi-v7a", "armv7a-linux-androideabi28-clang", "arm",   "7"),
    GoAbi("x86_64",      "x86_64-linux-android28-clang",     "amd64", null),
)

val goSrcDir = layout.projectDirectory.dir("src/main/golang")
// Build the main package cheezy/native (contains func main and //export functions).
// Activation of all Mihomo plugin inits is done via blank import in native/import_all.go.
val goEntryPkg = "./native"
val goOutBase = layout.buildDirectory.dir("intermediates/golang")

/**
 * Extracts mihomo version from go.mod during the configuration phase. Passed
 * into libclash.so via -ldflags -X main.mihomoVersion so the UI can
 * show "which core this build was assembled from" without a secondary source
 * of truth.
 *
 * Priority:
 *   1) replace directive (fork or local path — the real source of code);
 *   2) require line (canonical metacubex/mihomo).
 * If nothing is found — "unknown" (the Go variable will keep its default).
 *
 * replace format in UI: "<fork>@<version>" to show "we are using this fork
 * instead of metacubex".
 */
fun readMihomoVersion(): String {
    val goMod = goSrcDir.file("go.mod").asFile
    if (!goMod.exists()) return "unknown"
    val lines = goMod.readLines()

    val replaceRe = Regex("""replace\s+github\.com/metacubex/mihomo\s*=>\s*(\S+)\s+(\S+)""")
    lines.firstNotNullOfOrNull { replaceRe.find(it) }?.let { m ->
        val (path, version) = m.destructured
        return if (path == "github.com/metacubex/mihomo") version else "$path@$version"
    }

    val requireRe = Regex("""github\.com/metacubex/mihomo\s+(\S+)""")
    return lines.firstNotNullOfOrNull { requireRe.find(it)?.groupValues?.get(1) } ?: "unknown"
}

/**
 * Returns the path to the clang-wrapper in the installed NDK for the current host OS.
 * On Windows, .cmd is needed; on Linux/macOS — no extension.
 *
 * AGP 9 removed android.sdkDirectory, so we read sdk.dir from local.properties /
 * ANDROID_HOME, as recommended by the AGP developers.
 */
fun androidSdkDir(): java.io.File {
    val local = rootProject.file("local.properties")
    if (local.exists()) {
        val props = Properties()
        local.inputStream().use { props.load(it) }
        val sdkDir = props.getProperty("sdk.dir")
        if (sdkDir != null) return file(sdkDir)
    }
    val envHome = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
    if (!envHome.isNullOrBlank()) return file(envHome)
    error("Cannot locate Android SDK: set sdk.dir in local.properties or ANDROID_HOME env var")
}

fun ndkClangExecutable(triple: String): String {
    val sdkDir = androidSdkDir()
    val ndkVer = android.ndkVersion
    val hostTag = when {
        OperatingSystem.current().isWindows -> "windows-x86_64"
        OperatingSystem.current().isMacOsX -> "darwin-x86_64"
        else -> "linux-x86_64"
    }
    val toolchainBin = sdkDir.resolve("ndk/$ndkVer/toolchains/llvm/prebuilt/$hostTag/bin")
    val suffix = if (OperatingSystem.current().isWindows) ".cmd" else ""
    return toolchainBin.resolve("$triple$suffix").absolutePath
}

goAbis.forEach { abi ->
    val taskName = "buildGoClash" + abi.androidAbi.replaceFirstChar { it.uppercase() }
        .replace("-v", "V").replace("-", "")

    tasks.register<Exec>(taskName) {
        group = "build"
        description = "Build libclash.so for ${abi.androidAbi} via Go cgo"

        // Inputs / outputs for incremental build and up-to-date checks.
        // mihomoVersion is a separate input so that go.mod changes (and thus
        // -X in ldflags) also invalidate the up-to-date check, even if
        // no *.go files changed.
        inputs.dir(goSrcDir).withPropertyName("goSrc")
        inputs.property("mihomoVersion", providers.provider { readMihomoVersion() })
        val outDir = goOutBase.map { it.dir(abi.androidAbi) }
        outputs.dir(outDir).withPropertyName("goOut")

        workingDir = goSrcDir.asFile
        executable = "go"

        // Output libclash.so to build/intermediates/golang/<abi>/libclash.so.
        // The file is named exactly so that the CMake target `clash` picks it up,
        // and AGP packs it into the APK as a standard jniLib.
        val outFile = outDir.map { it.file("libclash.so").asFile.absolutePath }

        doFirst {
            outDir.get().asFile.mkdirs()

            // Environment variables cannot be set via DSL before doFirst (workingDir/env
            // do not account for late initialization of android.sdkDirectory).
            environment("CC", ndkClangExecutable(abi.clangTriple))
            environment("CGO_ENABLED", "1")
            environment("GOOS", "android")
            environment("GOARCH", abi.goArch)
            abi.goArm?.let { environment("GOARM", it) }

            // CMFA tags: foss + with_gvisor + cmfa. Without them, mihomo will be incomplete.
            val buildTags = "foss,with_gvisor,cmfa"

            // Mihomo version compiled into libclash.so. Passed via -X
            // main.mihomoVersion — the Go linker will write the string to native/version.go.
            // Spaces in the value are dangerous (break ldflags parsing), so only
            // numbers/letters/dots/hyphens are allowed — go.mod provides this.
            val mihomoVersion = readMihomoVersion()

            // Go build entry point — the main package cheezy/native.
            // Build with -buildmode=c-shared to get libclash.so + libclash.h.
            // -trimpath removes absolute host paths from the binary (important for reproducibility).
            // -ldflags='-s -w' strips debug info (release-only optimization — I'll keep it always).
            commandLine = listOf(
                "go", "build",
                "-buildmode=c-shared",
                "-trimpath",
                "-ldflags=-s -w -buildid= -X main.mihomoVersion=$mihomoVersion",
                "-tags", buildTags,
                "-o", outFile.get(),
                goEntryPkg,
            )

            logger.lifecycle("[goBuild] $taskName -> ${outFile.get()}")
            logger.lifecycle("[goBuild] CC=${environment["CC"]} GOARCH=${environment["GOARCH"]}")
            logger.lifecycle("[goBuild] mihomoVersion=$mihomoVersion")
            logger.lifecycle("[goBuild] commandLine=$commandLine")
        }
    }
}

// Collect Go-output into a separate folder with ABI structure (as required by jniLibs),
// so that AGP picks it up as another jniLibs-source via the variant.sources API.
// Directory build/generatedJniLibs/<abi>/libclash.so.
val generatedJniLibsDir = layout.buildDirectory.dir("generatedJniLibs")

val assembleGoJniLibs = tasks.register<Sync>("assembleGoJniLibs") {
    group = "build"
    description = "Collects Go-built libclash.so files into ABI subdirs for AGP packaging"
    goAbis.forEach { abi ->
        from(goOutBase.map { it.dir(abi.androidAbi) }) {
            include("libclash.so")
            into(abi.androidAbi)
        }
        dependsOn("buildGoClash" + abi.androidAbi.replaceFirstChar { it.uppercase() }
            .replace("-v", "V").replace("-", ""))
    }
    into(generatedJniLibsDir)
}

// AGP 9 Variant API: add generatedJniLibsDir as another jniLibs-source.
// addStaticSourceDirectory takes an absolute path. The directory is guaranteed
// to be created by assembleGoJniLibs tasks, which we attach to mergeJniLibFolders.
androidComponents.onVariants { variant ->
    val absPath = generatedJniLibsDir.get().asFile.absolutePath
    variant.sources.jniLibs?.addStaticSourceDirectory(absPath)

    // Attach CMake build of libbridge to Go build of libclash: CMake links bridge with clash,
    // meaning libclash.so must exist BEFORE running CMake.
    val cmakeType = if (variant.buildType == "debug") "Debug" else "RelWithDebInfo"
    goAbis.forEach { abi ->
        val goTask = "buildGoClash" + abi.androidAbi.replaceFirstChar { it.uppercase() }
            .replace("-v", "V").replace("-", "")
        tasks.matching { it.name == "buildCMake$cmakeType[${abi.androidAbi}]" }
            .configureEach { dependsOn(goTask) }
    }

    // mergeJniLibFolders must run after Go build + Sync.
    val mergeJni = "merge${variant.name.replaceFirstChar { it.uppercase() }}JniLibFolders"
    tasks.matching { it.name == mergeJni }.configureEach { dependsOn(assembleGoJniLibs) }
}

// ============================================================================
// Local tasks for updating mihomo. Same scenario as in
// .github/workflows/bump-mihomo.yml, but without PR wrapping — for quick
// experimentation like "changed ref, see if it builds".
//
// Examples:
//   gradlew :core:bumpMihomo                                # Alpha HEAD
//   gradlew :core:bumpMihomo -Pref=v1.19.5                  # tag
//   gradlew :core:bumpMihomo -Pref=Alpha \
//           -PreplaceWith=github.com/vernesong/mihomo       # fork
//   gradlew :core:printMihomoVersion                        # current version
//
// IMPORTANT: for forks with their own `module github.com/metacubex/mihomo` in
// their go.mod (vernesong and others), be sure to specify replaceWith —
// otherwise Go will fail with `module declares its path as ... but was required as ...`.
// ============================================================================

tasks.register("printMihomoVersion") {
    group = "verification"
    description = "Show current mihomo version from go.mod"
    doLast {
        println("mihomo: ${readMihomoVersion()}")
    }
}

tasks.register("bumpMihomo") {
    group = "build setup"
    description = "Update mihomo to the specified ref (default is Alpha HEAD). " +
        "Optional -PreplaceWith for a fork."

    doLast {
        val pkg = "github.com/metacubex/mihomo"
        val ref = (project.findProperty("ref") as String?) ?: "Alpha"
        val replaceWith = (project.findProperty("replaceWith") as String?)?.takeIf { it.isNotBlank() }

        val goWorkDir = goSrcDir.asFile
        logger.lifecycle("[bumpMihomo] pkg=$pkg ref=$ref replaceWith=${replaceWith ?: "(none)"}")
        logger.lifecycle("[bumpMihomo] old: ${readMihomoVersion()}")

        if (replaceWith == null) {
            // Normal path: same module, different versions. Just in case,
            // we drop the replace directive from previous fork bumps,
            // otherwise `go get` will just update require, while replace will
            // continue to redirect the build to the fork (and the UI will show old info).
            runGo(goWorkDir, "mod", "edit", "-dropreplace", pkg, ignoreFailure = true)
            runGo(goWorkDir, "get", "$pkg@$ref")
        } else {
            // Fork case: first clean the old replace, then set a specific
            // pseudo-version (Go-toolchain cannot resolve a branch for replace).
            runGo(goWorkDir, "mod", "edit", "-dropreplace", pkg, ignoreFailure = true)

            val resolved = resolveForkVersion(replaceWith, ref)
            logger.lifecycle("[bumpMihomo] resolved $replaceWith@$ref -> $resolved")

            runGo(goWorkDir, "mod", "edit", "-replace", "$pkg=$replaceWith@$resolved")
            runGo(goWorkDir, "mod", "download", pkg)
        }

        runGo(goWorkDir, "mod", "tidy")
        logger.lifecycle("[bumpMihomo] new: ${readMihomoVersion()}")
    }
}

/**
 * Runs `go <args>` in the specified directory. By default, it fails if go
 * returns a non-zero code. `ignoreFailure` is needed for `go mod edit -dropreplace`,
 * which complains if the replace is missing — this is normal.
 */
fun runGo(workDir: File, vararg args: String, ignoreFailure: Boolean = false) {
    val cmd = listOf("go") + args
    logger.lifecycle("[bumpMihomo] $ ${cmd.joinToString(" ")}")
    val result = providers.exec {
        commandLine = cmd
        workingDir = workDir
        isIgnoreExitValue = ignoreFailure
    }.result.get()
    if (!ignoreFailure && result.exitValue != 0) {
        throw GradleException("go ${args.joinToString(" ")} exited with ${result.exitValue}")
    }
}

/**
 * Resolves a fork's ref (branch / tag / sha) into a Go pseudo-version like
 * v0.0.0-<UTC timestamp>-<12-sha>. Implementation matches the workflow
 * .github/workflows/bump-mihomo.yml: ls-remote for the name, shallow-clone
 * to get the commit date.
 *
 * If the ref already looks like a version (^v\d+\.\d+\.), it's returned as is.
 */
fun resolveForkVersion(forkPath: String, ref: String): String {
    if (Regex("""^v\d+\.\d+\.""").containsMatchIn(ref)) {
        return ref
    }

    val remote = "https://$forkPath.git"

    // git ls-remote returns <sha>\t<refname> for each match.
    val lsOut = providers.exec {
        commandLine = listOf("git", "ls-remote", remote, "refs/heads/$ref", "refs/tags/$ref")
    }.standardOutput.asText.get()

    val sha = lsOut.lineSequence()
        .mapNotNull { it.split('\t').firstOrNull()?.takeIf { s -> s.length in 7..40 } }
        .firstOrNull()
        ?: if (Regex("""^[0-9a-f]{7,40}$""").matches(ref)) ref
        else throw GradleException(
            "Cannot resolve ref '$ref' in $forkPath: not a branch, tag, or sha"
        )

    val tmp = File.createTempFile("bumpMihomo", "").also {
        it.delete()
        it.mkdirs()
    }
    try {
        providers.exec {
            commandLine = listOf(
                "git", "-c", "protocol.version=2", "clone",
                "--filter=blob:none", "--no-checkout", "--depth", "1", remote, tmp.absolutePath
            )
        }.result.get()
        providers.exec {
            commandLine = listOf("git", "-C", tmp.absolutePath, "fetch", "--depth", "1", "origin", sha)
        }.result.get()
        // Go pseudo-version requires a UTC commit timestamp, otherwise the linker rejects it.
        val date = providers.exec {
            commandLine = listOf(
                "git", "-C", tmp.absolutePath,
                "show", "-s", "--format=%cd", "--date=format-local:%Y%m%d%H%M%S", sha
            )
            environment("TZ", "UTC")
        }.standardOutput.asText.get().trim()
        val short = sha.take(12)
        return "v0.0.0-$date-$short"
    } finally {
        tmp.deleteRecursively()
    }
}
