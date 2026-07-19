import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
} from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { v4 as uuidv4 } from 'uuid'
import { dialog } from 'electron'
import type {
  AccessControlRule,
  AppSettings,
  ProfileMeta,
  SubscriptionInfo,
} from '../shared/types'
import { policyToClash } from '../shared/types'
import { profileDir, profilesRoot } from './paths'
import { getSettings, store } from './store'
import { log } from './logger'
import {
  decodeMaybeBase64Header,
  displayProfileName,
  normalizeSubscriptionBody,
  parseContentDispositionFilename,
  subscriptionFromHeaders,
  subscriptionHeaders,
} from './subscription'

const BASE = 'base.yaml'
const CONFIG = 'config.yaml'

export function ensureProfilesRoot(): void {
  mkdirSync(profilesRoot(), { recursive: true })
}

export function listProfiles(): ProfileMeta[] {
  return store.get('profiles').map((p) => ({
    ...p,
    name: displayProfileName(p.name),
  }))
}

export function getActiveProfileId(): string | null {
  return store.get('activeProfileId')
}

export function activeConfigPath(): string | null {
  const id = getActiveProfileId()
  if (!id) return null
  return join(profileDir(id), CONFIG)
}

export function activeProfileDir(): string | null {
  const id = getActiveProfileId()
  if (!id) return null
  return profileDir(id)
}

function parseClashMapping(raw: string): Record<string, unknown> {
  const loaded = yaml.load(raw)
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new Error(
      'Config is not a Clash YAML mapping (got ' +
        (loaded === null ? 'null' : typeof loaded) +
        '). Subscription may have returned share-links or plain text.',
    )
  }
  return loaded as Record<string, unknown>
}

/** Rebuild config.yaml = base.yaml + enabled overrides (mixed-port, tun, dns). */
export function rebuildConfig(profileId: string, settings: AppSettings = getSettings()): string {
  const dir = profileDir(profileId)
  const basePath = join(dir, BASE)
  if (!existsSync(basePath)) {
    throw new Error(`missing ${BASE} for profile ${profileId}`)
  }
  const raw = readFileSync(basePath, 'utf8')
  const doc = parseClashMapping(raw)

  applyMixedPortOverride(doc, settings)
  applyTunOverride(doc, settings)
  applyAccessControlRules(doc, settings.accessControlRules ?? [])
  ensureDns(doc)

  // Always bind controller to loopback for the desktop UI.
  doc['external-controller'] = '127.0.0.1:9090'
  const secret = store.get('controllerSecret')
  if (secret) doc.secret = secret

  const out = yaml.dump(doc, { lineWidth: -1, noRefs: true })
  writeFileSync(join(dir, CONFIG), out, 'utf8')
  return join(dir, CONFIG)
}

function applyMixedPortOverride(doc: Record<string, unknown>, settings: AppSettings): void {
  doc['mixed-port'] = settings.mixedPort
  doc['allow-lan'] = settings.allowLan
  if (!doc['bind-address']) doc['bind-address'] = settings.allowLan ? '*' : '127.0.0.1'
}

/** B2: desktop enables YAML tun (opposite of Android patchTun). */
export function applyTunOverride(doc: Record<string, unknown>, settings: AppSettings): void {
  const tunOn = settings.connectionMode === 'tun' || settings.tunEnabled
  if (!tunOn) {
    doc.tun = { enable: false }
    return
  }
  doc.tun = {
    enable: true,
    stack: settings.tunStack,
    'auto-route': true,
    'auto-detect-interface': true,
    'strict-route': true,
    'dns-hijack': ['any:53', 'tcp://any:53'],
  }
}

/** Prepend PROCESS-NAME rules at the top of rules (user Access Control). */
export function applyAccessControlRules(
  doc: Record<string, unknown>,
  rules: AccessControlRule[],
): void {
  const injected = rules
    .filter((r) => r.processName?.trim() && r.policy?.trim())
    .map((r) => `PROCESS-NAME,${r.processName.trim()},${policyToClash(r.policy.trim())}`)

  const existing = Array.isArray(doc.rules)
    ? (doc.rules as unknown[]).filter((x): x is string => typeof x === 'string')
    : []

  // Drop previously injected PROCESS-NAME lines that match our format at the head,
  // then prepend fresh ones so rebuild is idempotent relative to base.yaml content.
  // Base may also contain PROCESS-NAME; we only prepend store rules each rebuild from base.
  doc.rules = [...injected, ...existing]
}

/** Proxy-group names from active profile base.yaml (offline-safe). */
export function getActiveProxyGroupNames(): string[] {
  const id = getActiveProfileId()
  if (!id) return []
  const basePath = join(profileDir(id), BASE)
  if (!existsSync(basePath)) return []
  try {
    const doc = parseClashMapping(readFileSync(basePath, 'utf8'))
    const groups = doc['proxy-groups']
    if (!Array.isArray(groups)) return []
    const names: string[] = []
    for (const g of groups) {
      if (g && typeof g === 'object' && typeof (g as { name?: unknown }).name === 'string') {
        names.push((g as { name: string }).name)
      }
    }
    return names
  } catch {
    return []
  }
}

/** Validate a single PROCESS-NAME rule via YAML round-trip. */
export function validateProcessNameRule(processName: string, policy: string): string {
  const name = processName.trim()
  const pol = policyToClash(policy.trim())
  if (!name || !pol) throw new Error('process name and policy are required')
  if (name.includes(',') || pol.includes(',')) {
    throw new Error('process name and policy must not contain commas')
  }
  const line = `PROCESS-NAME,${name},${pol}`
  const parts = line.split(',')
  if (parts.length !== 3 || parts[0] !== 'PROCESS-NAME' || !parts[1] || !parts[2]) {
    throw new Error(`invalid rule format: ${line}`)
  }
  const probe = { rules: [line] }
  const dumped = yaml.dump(probe, { lineWidth: -1, noRefs: true })
  const loaded = yaml.load(dumped)
  if (!loaded || typeof loaded !== 'object' || !Array.isArray((loaded as { rules?: unknown }).rules)) {
    throw new Error('YAML round-trip failed for rule')
  }
  return line
}

function ensureDns(doc: Record<string, unknown>): void {
  const dns = (doc.dns as Record<string, unknown>) || {}
  if (dns.enable !== true) {
    dns.enable = true
    dns['enhanced-mode'] = dns['enhanced-mode'] || 'fake-ip'
    dns['fake-ip-range'] = dns['fake-ip-range'] || '198.18.0.1/16'
    dns.nameserver = dns.nameserver || ['8.8.8.8', '1.1.1.1']
  }
  doc.dns = dns
}

export async function importFromUrl(url: string, name?: string): Promise<ProfileMeta> {
  ensureProfilesRoot()
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Only https:// subscription URLs are allowed')
  }
  const headers = subscriptionHeaders()
  log(`importing profile from ${url} (UA=${headers['User-Agent']})`)
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200) || res.statusText}`)
  }
  if (!/^https:/i.test(res.url)) {
    throw new Error(`Redirect left HTTPS (final URL scheme: ${res.url.split(':')[0]})`)
  }
  const raw = await res.text()
  const text = normalizeSubscriptionBody(raw)
  const subscription = subscriptionFromHeaders(res.headers)
  const title =
    name ||
    parseContentDispositionFilename(res.headers.get('content-disposition')) ||
    subscription.title ||
    decodeMaybeBase64Header(res.headers.get('profile-title')) ||
    decodeURIComponent(url.split('/').pop() || 'profile')
  return createProfileFromYaml(text, title, url, subscription)
}

export async function importFromFileDialog(): Promise<ProfileMeta | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import Clash config',
    filters: [
      { name: 'YAML', extensions: ['yaml', 'yml'] },
      { name: 'All', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const text = readFileSync(result.filePaths[0], 'utf8')
  const base = result.filePaths[0].split(/[/\\]/).pop() || 'profile'
  return createProfileFromYaml(text, base.replace(/\.(ya?ml)$/i, ''))
}

export const MANAGED_PROFILE_ID = 'managed-primary'

/**
 * Upsert the single managed CheezyVPN profile (stable id), download YAML from URL.
 */
export async function upsertManagedProfile(
  url: string,
  name: string,
  subscription?: SubscriptionInfo,
): Promise<ProfileMeta> {
  ensureProfilesRoot()
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Only https:// subscription URLs are allowed')
  }
  const headers = subscriptionHeaders()
  log(`upserting managed profile from ${url}`)
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200) || res.statusText}`)
  }
  if (!/^https:/i.test(res.url)) {
    throw new Error(`Redirect left HTTPS (final URL scheme: ${res.url.split(':')[0]})`)
  }
  const raw = await res.text()
  const text = normalizeSubscriptionBody(raw)
  parseClashMapping(text)

  const fromHeaders = subscriptionFromHeaders(res.headers)
  const merged: SubscriptionInfo = {
    ...fromHeaders,
    ...subscription,
    title: subscription?.title || fromHeaders.title,
    upload: subscription?.upload ?? fromHeaders.upload,
    download: subscription?.download ?? fromHeaders.download,
    total: subscription?.total ?? fromHeaders.total,
    expire: subscription?.expire ?? fromHeaders.expire,
  }

  const title =
    name ||
    parseContentDispositionFilename(res.headers.get('content-disposition')) ||
    merged.title ||
    'CheezyVPN'

  const id = MANAGED_PROFILE_ID
  const dir = profileDir(id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, BASE), text, 'utf8')

  const list = store.get('profiles')
  const existing = list.find((p) => p.id === id)
  const meta: ProfileMeta = {
    id,
    name: displayProfileName(title),
    url,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    subscription: merged,
  }
  const next = existing ? list.map((p) => (p.id === id ? meta : p)) : [...list, meta]
  store.set('profiles', next)
  store.set('activeProfileId', id)
  rebuildConfig(id)
  return { ...meta, name: displayProfileName(meta.name) }
}

function createProfileFromYaml(
  text: string,
  name: string,
  url?: string,
  subscription?: SubscriptionInfo,
): ProfileMeta {
  // Validate Clash mapping before writing
  parseClashMapping(text)
  const id = uuidv4()
  const dir = profileDir(id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, BASE), text, 'utf8')
  const meta: ProfileMeta = {
    id,
    name: displayProfileName(name),
    url,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    subscription,
  }
  const list = store.get('profiles')
  list.push(meta)
  store.set('profiles', list)
  if (!getActiveProfileId()) {
    store.set('activeProfileId', id)
  }
  rebuildConfig(id)
  return { ...meta, name: displayProfileName(meta.name) }
}

export function setActiveProfile(id: string): void {
  if (!listProfiles().some((p) => p.id === id)) throw new Error('unknown profile')
  store.set('activeProfileId', id)
  rebuildConfig(id)
}

export function deleteProfile(id: string): void {
  if (id === MANAGED_PROFILE_ID) {
    throw new Error('Cannot delete the managed CheezyVPN profile')
  }
  const list = store.get('profiles').filter((p) => p.id !== id)
  store.set('profiles', list)
  if (getActiveProfileId() === id) {
    store.set('activeProfileId', list[0]?.id ?? null)
  }
  const dir = profileDir(id)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export function rebuildActive(settings: AppSettings = getSettings()): string | null {
  const id = getActiveProfileId()
  if (!id) return null
  return rebuildConfig(id, settings)
}

/** Copy geo assets note: mihomo downloads them on first run into home. */
export function syncHomeGeoPlaceholder(): void {
  /* no-op — mihomo Alpha fetches MMDB itself when missing */
}

export function migrateOrphanDirs(): void {
  ensureProfilesRoot()
  if (!existsSync(profilesRoot())) return
  for (const name of readdirSync(profilesRoot())) {
    const dir = profileDir(name)
    if (!existsSync(join(dir, BASE)) && existsSync(join(dir, CONFIG))) {
      copyFileSync(join(dir, CONFIG), join(dir, BASE))
    }
  }
}
