export const WINDOWS_PROXY_KEYS = ['ProxyServer', 'ProxyOverride', 'ProxyEnable'] as const
export type WindowsProxyKey = (typeof WINDOWS_PROXY_KEYS)[number]
export type RegistryValue = { type: 'REG_SZ' | 'REG_EXPAND_SZ' | 'REG_DWORD'; data: string } | null
export type WindowsProxyValues = Record<WindowsProxyKey, RegistryValue>

export interface WindowsProxySnapshot {
  before: WindowsProxyValues
  applied: WindowsProxyValues
  /** Write-ahead state: the process may stop between registry write and store commit. */
  pending?: WindowsProxyValues
}

export const WINDOWS_PROXY_BYPASS =
  'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>'

interface ProxyAdapter {
  read: () => Promise<WindowsProxyValues>
  write: (key: WindowsProxyKey, value: RegistryValue) => Promise<void>
  load: () => WindowsProxySnapshot | null
  save: (snapshot: WindowsProxySnapshot | null) => void
}

function same(a: WindowsProxyValues, b: WindowsProxyValues): boolean {
  return WINDOWS_PROXY_KEYS.every(key =>
    a[key] === null ? b[key] === null :
      b[key] !== null && a[key]?.type === b[key]?.type && a[key]?.data === b[key]?.data,
  )
}

function owned(current: WindowsProxyValues, saved: WindowsProxySnapshot): boolean {
  return same(current, saved.applied) || (!!saved.pending && same(current, saved.pending))
}

/** OS-independent transaction logic, tested without changing the host registry. */
export class WindowsProxyState {
  private adapter: ProxyAdapter

  constructor(adapter: ProxyAdapter) {
    this.adapter = adapter
  }

  private async transition(before: WindowsProxyValues, from: WindowsProxyValues, to: WindowsProxyValues): Promise<void> {
    let applied = from
    for (const key of WINDOWS_PROXY_KEYS) {
      const next = { ...applied, [key]: to[key] }
      if (same(applied, next)) continue
      // Recheck before each write, including during rollback.
      if (!same(await this.adapter.read(), applied)) {
        this.adapter.save(null)
        throw new Error('System proxy was changed by another application. Its settings were left unchanged.')
      }
      this.adapter.save({ before, applied, pending: next })
      await this.adapter.write(key, to[key])
      applied = next
      this.adapter.save({ before, applied })
    }
  }

  async enable(port: number): Promise<void> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid system proxy port')
    const current = await this.adapter.read()
    const saved = this.adapter.load()
    // Reconnecting after an external change establishes a new baseline.
    const before = saved && owned(current, saved) ? saved.before : current
    const target: WindowsProxyValues = {
      ProxyServer: { type: 'REG_SZ', data: `127.0.0.1:${port}` },
      ProxyOverride: { type: 'REG_SZ', data: WINDOWS_PROXY_BYPASS },
      ProxyEnable: { type: 'REG_DWORD', data: '1' },
    }
    this.adapter.save({ before, applied: current })
    try {
      await this.transition(before, current, target)
    } catch (error) {
      try {
        await this.restore()
      } catch {
        // Keep the durable journal so disconnect/startup can retry restoration.
        throw new Error('Could not apply or restore the system proxy. Recovery will be retried on disconnect or app startup.', { cause: error })
      }
      throw error
    }
  }

  /** false means somebody changed the settings; no registry writes are made. */
  async restore(): Promise<boolean> {
    const saved = this.adapter.load()
    if (!saved) return true
    const current = await this.adapter.read()
    if (!owned(current, saved)) {
      this.adapter.save(null)
      return false
    }
    await this.transition(saved.before, current, saved.before)
    this.adapter.save(null)
    return true
  }
}

/** Validate structured registry output without trimming or expanding string values. */
export function parseWindowsProxyValues(stdout: string): WindowsProxyValues {
  const raw = JSON.parse(stdout.replace(/^\uFEFF/, '')) as Record<string, RegistryValue>
  const result: WindowsProxyValues = { ProxyServer: null, ProxyOverride: null, ProxyEnable: null }
  for (const key of WINDOWS_PROXY_KEYS) {
    const value = raw[key]
    if (value === null) continue
    if (!value || typeof value.data !== 'string') throw new Error('Invalid system proxy registry value')
    const type = value.type
    if ((key === 'ProxyEnable' && type !== 'REG_DWORD') ||
        (key !== 'ProxyEnable' && type !== 'REG_SZ' && type !== 'REG_EXPAND_SZ')) {
      throw new Error('Unsupported system proxy registry value type')
    }
    let data = value.data
    if (type === 'REG_DWORD') {
      const number = Number(data)
      if (!data || !Number.isInteger(number) || number < 0 || number > 0xffffffff) {
        throw new Error('Invalid system proxy registry value')
      }
      data = String(number)
    }
    result[key] = { type: type as NonNullable<RegistryValue>['type'], data }
  }
  return result
}
