import { execFile } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import { log } from './logger'
import { store } from './store'
import { WindowsProxyState, parseWindowsProxyValues, WINDOWS_PROXY_BYPASS } from './windows-proxy-state'

const execFileAsync = promisify(execFile)
let proxyOperation: Promise<void> = Promise.resolve()

/**
 * A5 — set / clear OS system HTTP(S) proxy pointing at mixed-port.
 */
export function setSystemProxy(enable: boolean, port: number): Promise<void> {
  const pending = proxyOperation.catch(() => undefined).then(() => applySystemProxy(enable, port))
  proxyOperation = pending
  return pending
}

async function applySystemProxy(enable: boolean, port: number): Promise<void> {
  const p = platform()
  try {
    if (p === 'win32') {
      await setWindowsProxy(enable, port)
    } else if (p === 'darwin') {
      await setMacProxy(enable, port)
    } else {
      await setLinuxGsettings(enable, port)
    }
    log(`system proxy ${enable ? 'on' : 'off'} (port ${port})`)
  } catch (e) {
    log(`system proxy failed: ${e}`, 'warn')
    throw e
  }
}

async function setWindowsProxy(enable: boolean, port: number): Promise<void> {
  const key =
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
  const options = { windowsHide: true, timeout: 10_000, encoding: 'utf8' as const }
  const read = async () => {
    // UTF-8 JSON preserves Unicode, empty/missing values and literal %variables%.
    // No profile or registry content is interpolated into PowerShell code.
    const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$proxyKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings')
if ($null -eq $proxyKey) { throw 'Internet Settings registry key is unavailable' }
try {
  $result = [ordered]@{}
  $names = $proxyKey.GetValueNames()
  foreach ($name in @('ProxyServer', 'ProxyOverride', 'ProxyEnable')) {
    $result[$name] = $null
    if ($names -contains $name) {
      $kind = $proxyKey.GetValueKind($name).ToString()
      $type = switch ($kind) { 'String' { 'REG_SZ' } 'ExpandString' { 'REG_EXPAND_SZ' } 'DWord' { 'REG_DWORD' } default { throw 'Unsupported proxy registry value type' } }
      $value = $proxyKey.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $result[$name] = @{ type = $type; data = [string]$value }
    }
  }
  $result | ConvertTo-Json -Compress
} finally { $proxyKey.Dispose() }
`
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
    ], options)
    return parseWindowsProxyValues(stdout)
  }
  const state = new WindowsProxyState({
    read,
    write: async (name, value) => {
      if (value === null) {
        await execFileAsync('reg', ['delete', key, '/v', name, '/f'], options)
      } else {
        await execFileAsync('reg', ['add', key, '/v', name, '/t', value.type, '/d', value.data, '/f'], options)
      }
    },
    load: () => store.get('windowsProxySnapshot') ?? null,
    save: snapshot => store.set('windowsProxySnapshot', snapshot),
  })
  if (enable) {
    await state.enable(port)
  } else if (store.get('windowsProxySnapshot')) {
    if (!(await state.restore())) log('system proxy changed externally; preserving current settings')
  } else if (store.get('systemProxyOwned')) {
    // Older versions did not retain a snapshot. Only disable a matching legacy
    // configuration; unknown previous values cannot be reconstructed.
    const current = await read()
    if (current.ProxyEnable?.data === '1' &&
        current.ProxyServer?.data === `127.0.0.1:${port}` &&
        current.ProxyOverride?.data === WINDOWS_PROXY_BYPASS) {
      await execFileAsync('reg', ['add', key, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'], options)
    }
  }
}

async function setMacProxy(enable: boolean, port: number): Promise<void> {
  // Apply to all hardware ports that look like network services.
  const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices'])
  const services = stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('*') && s !== 'An asterisk')
  for (const svc of services) {
    if (enable) {
      await execFileAsync('networksetup', ['-setwebproxy', svc, '127.0.0.1', String(port)])
      await execFileAsync('networksetup', ['-setsecurewebproxy', svc, '127.0.0.1', String(port)])
      await execFileAsync('networksetup', ['-setsocksfirewallproxy', svc, '127.0.0.1', String(port)])
      await execFileAsync('networksetup', ['-setwebproxystate', svc, 'on'])
      await execFileAsync('networksetup', ['-setsecurewebproxystate', svc, 'on'])
      await execFileAsync('networksetup', ['-setsocksfirewallproxystate', svc, 'on'])
    } else {
      await execFileAsync('networksetup', ['-setwebproxystate', svc, 'off']).catch(() => undefined)
      await execFileAsync('networksetup', ['-setsecurewebproxystate', svc, 'off']).catch(
        () => undefined,
      )
      await execFileAsync('networksetup', ['-setsocksfirewallproxystate', svc, 'off']).catch(
        () => undefined,
      )
    }
  }
}

async function setLinuxGsettings(enable: boolean, port: number): Promise<void> {
  if (enable) {
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'manual']).catch(
      () => undefined,
    )
    await execFileAsync('gsettings', [
      'set',
      'org.gnome.system.proxy.http',
      'host',
      '127.0.0.1',
    ]).catch(() => undefined)
    await execFileAsync('gsettings', [
      'set',
      'org.gnome.system.proxy.http',
      'port',
      String(port),
    ]).catch(() => undefined)
    await execFileAsync('gsettings', [
      'set',
      'org.gnome.system.proxy.https',
      'host',
      '127.0.0.1',
    ]).catch(() => undefined)
    await execFileAsync('gsettings', [
      'set',
      'org.gnome.system.proxy.https',
      'port',
      String(port),
    ]).catch(() => undefined)
    await execFileAsync('gsettings', [
      'set',
      'org.gnome.system.proxy.socks',
      'host',
      '127.0.0.1',
    ]).catch(() => undefined)
    await execFileAsync('gsettings', [
      'set',
      'org.gnome.system.proxy.socks',
      'port',
      String(port),
    ]).catch(() => undefined)
  } else {
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'none']).catch(
      () => undefined,
    )
  }
}
