import { execFile } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import { log } from './logger'

const execFileAsync = promisify(execFile)

/**
 * A5 — set / clear OS system HTTP(S) proxy pointing at mixed-port.
 */
export async function setSystemProxy(enable: boolean, port: number): Promise<void> {
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
  if (enable) {
    await execFileAsync('reg', ['add', key, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f'])
    await execFileAsync('reg', [
      'add',
      key,
      '/v',
      'ProxyServer',
      '/t',
      'REG_SZ',
      '/d',
      `127.0.0.1:${port}`,
      '/f',
    ])
    await execFileAsync('reg', [
      'add',
      key,
      '/v',
      'ProxyOverride',
      '/t',
      'REG_SZ',
      '/d',
      'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>',
      '/f',
    ])
  } else {
    await execFileAsync('reg', ['add', key, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'])
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
