import org.gradle.internal.os.OperatingSystem

plugins {
    base
}

/**
 * Gradle façade for the Electron app under this directory.
 * Parallel to :app / :core / :baselineprofile — npm Exec wrappers only.
 *
 * Keep Gradle outputs out of [desktop/build] (icon.ico / installer.nsh live there).
 */
layout.buildDirectory.set(rootProject.layout.buildDirectory.dir("desktop"))

val isWindows = OperatingSystem.current().isWindows
val npmCmd = if (isWindows) "npm.cmd" else "npm"

tasks.register<Exec>("npmInstall") {
    group = "desktop"
    description = "Install desktop npm deps from package-lock (npm ci)"
    workingDir = projectDir
    commandLine(npmCmd, "ci")
    inputs.files("package.json", "package-lock.json")
    outputs.dir("node_modules")
}

tasks.register<Exec>("fetchCore") {
    group = "desktop"
    description = "Download mihomo sidecar into resources/core"
    workingDir = projectDir
    commandLine(npmCmd, "run", "fetch-core")
    dependsOn("npmInstall")
}

tasks.register<Exec>("buildHelper") {
    group = "desktop"
    description = "Build Windows CheezyHelperService"
    workingDir = projectDir
    commandLine(npmCmd, "run", "build:helper")
    dependsOn("npmInstall")
    onlyIf { isWindows }
}

tasks.register<Exec>("typecheck") {
    group = "desktop"
    description = "Typecheck desktop main + renderer"
    workingDir = projectDir
    commandLine(npmCmd, "run", "typecheck")
    dependsOn("npmInstall")
}

tasks.register<Exec>("icons") {
    group = "desktop"
    description = "Rasterize OS / tray icons from SVG"
    workingDir = projectDir
    commandLine(npmCmd, "run", "icons")
    dependsOn("npmInstall")
}

tasks.register<Exec>("syncVersion") {
    group = "desktop"
    description = "Sync desktop package.json version from app/version.properties"
    workingDir = projectDir
    commandLine(npmCmd, "run", "sync-version")
    dependsOn("npmInstall")
}

tasks.register<Exec>("compile") {
    group = "desktop"
    description = "Compile Electron main/preload/renderer (electron-vite build)"
    workingDir = projectDir
    commandLine(npmCmd, "run", "build")
    dependsOn("npmInstall")
}

tasks.register<Exec>("packageUnpacked") {
    group = "desktop"
    description = "Build unpacked desktop app (electron-builder --dir, no installer)"
    workingDir = projectDir
    commandLine(npmCmd, "run", "package")
    dependsOn("npmInstall")
    doLast {
        val releaseDir = projectDir.resolve("release")
        val unpacked =
            releaseDir
                .listFiles()
                ?.filter { it.isDirectory && it.name.endsWith("-unpacked") }
                ?.maxByOrNull { it.lastModified() }
                ?: releaseDir.takeIf { it.isDirectory }
        if (unpacked == null || !unpacked.exists()) {
            logger.warn("packageUnpacked: no output folder under ${releaseDir.absolutePath}")
            return@doLast
        }
        val path = unpacked.absolutePath
        logger.lifecycle("Opening $path")
        val os = OperatingSystem.current()
        val cmd =
            when {
                os.isWindows -> listOf("explorer.exe", path)
                os.isMacOsX -> listOf("open", path)
                else -> listOf("xdg-open", path)
            }
        try {
            ProcessBuilder(cmd).start()
        } catch (e: Exception) {
            logger.warn("packageUnpacked: failed to open folder: ${e.message}")
        }
    }
}

tasks.register<Exec>("distInstaller") {
    group = "desktop"
    description = "Build desktop installers for the current platform"
    workingDir = projectDir
    commandLine(npmCmd, "run", "dist")
    dependsOn("npmInstall")
}

tasks.named("assemble") {
    dependsOn("packageUnpacked")
}
