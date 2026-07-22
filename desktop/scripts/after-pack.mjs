/**
 * afterPack: embed product icon + version strings into the Windows exe
 * without electron-builder's winCodeSign (symlink privilege issues).
 *
 * Uses pure-JS `resedit` (works on Linux CI when packaging win32) instead of
 * the deprecated native `rcedit` binary wrapper.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as ResEdit from 'resedit'

const LANG_EN_US = 1033
const CODEPAGE_UTF16 = 1200

/** @param {string} version */
function parseVersionParts(version) {
  const parts = String(version)
    .split(/[.+-]/)
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isFinite(n))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0]
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const productName = context.packager.appInfo.productName || 'CheezyClash'
  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = join(context.appOutDir, exeName)
  const iconIco = join(context.packager.projectDir, 'build', 'icon.ico')

  if (!existsSync(exePath)) {
    console.warn(`afterPack: exe not found at ${exePath}`)
    return
  }
  if (!existsSync(iconIco)) {
    console.warn(`afterPack: icon not found at ${iconIco}`)
    return
  }

  const version = context.packager.appInfo.version
  const copyright =
    context.packager.appInfo.copyright || `Copyright © ${productName}`
  const [major, minor, patch, build] = parseVersionParts(version)

  // Electron builds may carry Authenticode; ignore so we can rewrite resources.
  const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true })
  const res = ResEdit.NtExecutableResource.from(exe)

  const iconFile = ResEdit.Data.IconFile.from(readFileSync(iconIco))
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
  const iconGroupId = iconGroups[0]?.id ?? 1
  const iconLang = iconGroups[0]?.lang ?? LANG_EN_US
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    iconGroupId,
    iconLang,
    iconFile.icons.map((item) => item.data),
  )

  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
  const vi = viList[0] ?? ResEdit.Resource.VersionInfo.createEmpty()
  vi.setFileVersion(major, minor, patch, build, LANG_EN_US)
  vi.setProductVersion(major, minor, patch, build, LANG_EN_US)
  vi.setStringValues(
    { lang: LANG_EN_US, codepage: CODEPAGE_UTF16 },
    {
      CompanyName: productName,
      FileDescription: productName,
      ProductName: productName,
      InternalName: productName,
      OriginalFilename: exeName,
      LegalCopyright: copyright,
      FileVersion: version,
      ProductVersion: version,
    },
  )
  vi.outputToResourceEntries(res.entries)

  res.outputResource(exe)
  writeFileSync(exePath, Buffer.from(exe.generate()))
  console.log(`afterPack: patched ${exeName} icon + ProductName=${productName} (resedit)`)
}
