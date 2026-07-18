/**
 * afterPack: embed product icon + version strings into the Windows exe
 * without electron-builder's winCodeSign (symlink privilege issues).
 */
import { join } from 'path'
import { existsSync } from 'fs'
import { rcedit } from 'rcedit'

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
  await rcedit(exePath, {
    icon: iconIco,
    'file-version': version,
    'product-version': version,
    'version-string': {
      CompanyName: productName,
      FileDescription: productName,
      ProductName: productName,
      InternalName: productName,
      OriginalFilename: exeName,
      LegalCopyright: copyright,
    },
  })
  console.log(`afterPack: patched ${exeName} icon + ProductName=${productName}`)
}
