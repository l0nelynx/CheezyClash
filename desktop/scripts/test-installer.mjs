import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import yaml from 'js-yaml'
import * as ResEdit from 'resedit'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(projectDir, path), 'utf8')
const config = yaml.load(await read('electron-builder.yml'))
const hooks = await read('build/installer.nsh')
const overrides = await read('build/installer-overrides.nsh')
const stock = await read('node_modules/app-builder-lib/templates/nsis/installSection.nsh')
const stockUtil = await read('node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh')

assert.match(hooks, /RequestExecutionLevel admin/)
assert.equal(config.nsis.oneClick, false)
assert.equal(config.nsis.createDesktopShortcut, true)
assert.equal(config.appId, 'com.cheezy.freedom.desktop')
assert.equal(config.executableName, 'CheezyClash')
assert.equal(config.nsis.shortcutName, 'CheezyClash')
assert.equal(config.nsis.script, undefined, 'Keep the generated uninstaller/signing pipeline')
// These deliberately pin the small upstream extension contract. A builder
// upgrade must fail tests rather than silently reintroducing shortcut removal.
assert.match(stockUtil, /!macro uninstallOldVersion ROOT_KEY\s+Push "\$\{ROOT_KEY\}"\s+Call uninstallOldVersion\s+!macroend/)
assert.ok(stock.indexOf('!include installer.nsh') < stock.indexOf('!insertmacro CHECK_APP_RUNNING'))
assert.ok(stock.indexOf('!insertmacro CHECK_APP_RUNNING') < stock.indexOf('!insertMacro setIsTryToKeepShortcuts'))
assert.ok(stock.indexOf('!insertMacro setIsTryToKeepShortcuts') < stock.indexOf('!insertmacro uninstallOldVersion'))
assert.match(overrides, /\$cheezyUpdate != "1"[\s\S]*Call uninstallOldVersion/)
assert.match(overrides, /!insertmacro cheezyStopProcesses[\s\S]*StrCpy \$cheezyPrepared "1"/)
assert.doesNotMatch(hooks + overrides, /UninstShortcut|UninstAppUserModelId|Delete.*\.lnk|sc\.exe delete/)

if (process.platform === 'win32') {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(projectDir, 'scripts/test-installer-processes.ps1')], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  console.log(result.stdout.trim())
}
console.log('Installer template / shortcut identity contract: OK')

if (process.argv.includes('--compile')) {
  assert.equal(process.platform, 'win32', 'Compile fixtures on Windows (no Wine/emulator)')
  const { build, Platform, Arch } = await import('electron-builder')
  const scratch = await mkdtemp(join(tmpdir(), 'cheezy-installer-test-'))
  try {
    for (const productName of ['CheezyClash', 'CheezyVPN']) {
      const fixtureConfig = structuredClone(config)
      const fixture = join(scratch, productName, 'unpacked')
      await mkdir(fixture, { recursive: true })
      // Intentionally not a runnable app. NSIS compilation only; the generated
      // setup is NEVER executed. Builder runs only its uninstaller generator,
      // which writes an uninstaller into TEMP and exits without installing.
      await writeFile(join(fixture, `${productName}.exe`), 'installer compile fixture, not an application')
      await build({
        projectDir,
        prepackaged: fixture,
        targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
        config: {
          ...fixtureConfig,
          extends: null,
          appId: productName === 'CheezyVPN' ? 'com.cheezy.vpn.desktop' : fixtureConfig.appId,
          productName,
          executableName: productName,
          directories: { ...fixtureConfig.directories, output: join(scratch, productName, 'output') },
          nsis: {
            ...fixtureConfig.nsis,
            packElevateHelper: false,
            shortcutName: productName,
            uninstallDisplayName: productName,
          },
        },
        publish: 'never',
      })
      const setup = await readFile(join(scratch, productName, 'output', 'CheezyClash-win-x64.exe'))
      const exe = ResEdit.NtExecutable.from(setup, { ignoreCert: true })
      const resources = ResEdit.NtExecutableResource.from(exe)
      const manifest = resources.entries.filter(entry => entry.type === 24)
        .map(entry => Buffer.from(entry.bin).toString('utf8')).join('')
      assert.match(manifest, /requestedExecutionLevel[^>]*level=["']requireAdministrator["']/,
        'Actual installer PE manifest must require administrator rights')
      console.log(`${productName}: installer and uninstaller compile OK (not installed)`)
    }
  } finally {
    // mkdtemp-owned fixtures only; never touch installed apps or user data.
    await rm(scratch, { recursive: true, force: true })
  }
}
