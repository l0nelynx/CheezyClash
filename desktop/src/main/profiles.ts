import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
} from 'fs'
import { spawn } from 'child_process'
import { join } from 'path'
import yaml from 'js-yaml'
import { v4 as uuidv4 } from 'uuid'
import { dialog } from 'electron'
import type { AccessControlRule, AppSettings, ProfileMeta, SubscriptionInfo } from '../shared/types'
import type {
  CustomRuleContext,
  CustomRuleDiagnostic,
  CustomRuleProfileContext,
} from '../shared/custom-rules'
import { normalizeCustomRules, validateCustomRule } from '../shared/custom-rules'
import {
  bundledCoreDir,
  coreBinaryPath,
  coreHome,
  corePresent,
  mihomoSafePaths,
  profileDir,
  profilesRoot,
} from './paths'
import { getSettings, getSelections, store } from './store'
import { applyControllerDefaults } from './controller-config'
import { log } from './logger'
import {
  decodeMaybeBase64Header,
  displayProfileName,
  normalizeSubscriptionBody,
  parseContentDispositionFilename,
  parseUpdateIntervalHours,
  subscriptionFromHeaders,
  subscriptionHeaders,
} from './subscription'
import { mihomoApi } from './mihomo-api'
import {
  applyNetworkSettings,
  effectiveNetworkFromDocument,
  type EffectiveNetworkConfig,
} from './network-config'
import { applyXrayMuxSettings } from './xray-mux-config'
import {
  applyCustomRules,
  customRuleContextFromDocument,
  emptyCustomRuleContext,
  parseRuleFailure,
  type InjectedCustomRule,
} from './custom-rules-config'

export { applyCustomRules, customRuleContextFromDocument } from './custom-rules-config'

const BASE = 'base.yaml'
const CONFIG = 'config.yaml'

interface GeneratedCustomRules {
  profileId: string
  profileName: string
  injected: InjectedCustomRule[]
  skipped: CustomRuleDiagnostic[]
}

const generatedCustomRules = new Map<string, GeneratedCustomRules>()

interface ProfileRefreshQueue {
  tail: Promise<unknown>
}

// Serialize updates of the same profile, including the optional core reload.
// Removing a queue invalidates downloads and queued work for that identity.
const profileRefreshQueues = new Map<string, ProfileRefreshQueue>()

/** Set from core-manager to avoid a circular profiles ↔ core-manager import. */
let reloadActiveCore: ((configPath: string, profileId: string) => Promise<void>) | null = null

export function setReloadActiveCoreHook(
  fn: ((configPath: string, profileId: string) => Promise<void>) | null,
): void {
  reloadActiveCore = fn
}

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

/** Rebuild config.yaml = base.yaml + enabled overrides/defaults. */
export function rebuildConfig(profileId: string, settings: AppSettings = getSettings()): string {
  const dir = profileDir(profileId)
  const basePath = join(dir, BASE)
  if (!existsSync(basePath)) {
    throw new Error(`missing ${BASE} for profile ${profileId}`)
  }
  const raw = readFileSync(basePath, 'utf8')
  const doc = parseClashMapping(raw)

  applyNetworkSettings(doc, settings)
  const profileName = listProfiles().find((profile) => profile.id === profileId)?.name ?? profileId
  const customRules = applyCustomRules(doc, settings.customRules ?? [], {
    id: profileId,
    name: profileName,
  })
  applyXrayMuxSettings(doc, settings)
  ensureDns(doc)

  applyControllerDefaults(doc)

  const out = yaml.dump(doc, { lineWidth: -1, noRefs: true })
  const configPath = join(dir, CONFIG)
  writeFileSync(configPath, out, 'utf8')
  generatedCustomRules.set(configPath, {
    profileId,
    profileName,
    ...customRules,
  })
  return configPath
}

/** Resolve launch requirements from base.yaml without writing config.yaml. */
export function resolveProfileNetwork(
  profileId: string,
  settings: AppSettings = getSettings(),
): EffectiveNetworkConfig {
  const basePath = join(profileDir(profileId), BASE)
  if (!existsSync(basePath)) throw new Error(`missing ${BASE} for profile ${profileId}`)
  const doc = parseClashMapping(readFileSync(basePath, 'utf8'))
  return applyNetworkSettings(doc, settings)
}

/** Read effective values from an already generated config.yaml. */
export function readEffectiveNetworkConfig(
  configPath: string,
  overrideEnabled = getSettings().networkOverrideEnabled,
): EffectiveNetworkConfig {
  const doc = parseClashMapping(readFileSync(configPath, 'utf8'))
  return effectiveNetworkFromDocument(doc, overrideEnabled)
}

/** @deprecated Compatibility wrapper for legacy PROCESS-NAME callers. */
export function applyAccessControlRules(
  doc: Record<string, unknown>,
  rules: AccessControlRule[],
): void {
  applyCustomRules(doc, normalizeCustomRules(undefined, rules))
}

/** Custom Rule context from the active profile base.yaml (offline-safe). */
export function getActiveCustomRuleContext(): CustomRuleContext {
  const empty = emptyCustomRuleContext()
  const activeProfileId = getActiveProfileId()
  const profiles: CustomRuleProfileContext[] = []

  for (const profile of listProfiles()) {
    const basePath = join(profileDir(profile.id), BASE)
    if (!existsSync(basePath)) continue
    try {
      const context = customRuleContextFromDocument(
        parseClashMapping(readFileSync(basePath, 'utf8')),
        { id: profile.id, name: profile.name },
      )
      profiles.push({
        id: profile.id,
        name: profile.name,
        proxyGroups: context.proxyGroups,
        proxyNames: context.proxyNames,
        ruleSets: context.ruleSets,
        subRules: context.subRules,
        profileId: profile.id,
        resolvedProxyTarget: context.resolvedProxyTarget,
      })
    } catch {
      /* A malformed profile remains visible elsewhere, but cannot provide rule dependencies. */
    }
  }

  const active = profiles.find((profile) => profile.id === activeProfileId)
  return {
    proxyGroups: active?.proxyGroups ?? [],
    proxyNames: active?.proxyNames ?? [],
    ruleSets: active?.ruleSets ?? [],
    subRules: active?.subRules ?? [],
    profileId: active?.id ?? activeProfileId,
    resolvedProxyTarget: active?.resolvedProxyTarget ?? null,
    activeProfileId,
    profiles,
    platform: empty.platform,
  }
}

interface CoreConfigTestResult {
  ok: boolean
  output: string
}

function testCoreConfig(configPath: string): Promise<CoreConfigTestResult> {
  mkdirSync(coreHome(), { recursive: true })
  mkdirSync(profilesRoot(), { recursive: true })
  return new Promise((resolve, reject) => {
    const childProcess = spawn(coreBinaryPath(), ['-t', '-d', coreHome(), '-f', configPath], {
      cwd: bundledCoreDir(),
      env: { ...globalThis.process.env, SAFE_PATHS: mihomoSafePaths() },
      windowsHide: true,
    })
    let output = ''
    const timer = setTimeout(() => {
      childProcess.kill()
      reject(new Error('Core config validation timed out'))
    }, 30_000)
    childProcess.stdout?.on('data', (chunk) => {
      output += chunk.toString()
    })
    childProcess.stderr?.on('data', (chunk) => {
      output += chunk.toString()
    })
    childProcess.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    childProcess.once('exit', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output: output.trim() })
    })
  })
}

/**
 * Ask the bundled core to parse the final generated YAML. Invalid injected rules
 * are removed one at a time; failures in profile-owned YAML remain fatal.
 */
export async function validateGeneratedConfig(
  configPath: string,
  profileId: string,
): Promise<CustomRuleDiagnostic[]> {
  const metadata = generatedCustomRules.get(configPath)
  if (!metadata || metadata.profileId !== profileId) return []
  const diagnostics = [...metadata.skipped]
  if (!corePresent()) return diagnostics

  const doc = parseClashMapping(readFileSync(configPath, 'utf8'))
  const rules = Array.isArray(doc.rules) ? [...doc.rules] : []
  const injected = [...metadata.injected]

  for (let attempt = 0; attempt <= metadata.injected.length; attempt++) {
    const result = await testCoreConfig(configPath)
    if (result.ok) {
      generatedCustomRules.set(configPath, { ...metadata, injected, skipped: diagnostics })
      return diagnostics
    }

    const failure = parseRuleFailure(result.output)
    if (!failure || failure.index < 0 || failure.index >= injected.length) {
      throw new Error(`Profile config validation failed: ${result.output || 'unknown error'}`)
    }

    const rejected = injected[failure.index]!
    diagnostics.push({
      ruleId: rejected.id,
      profileId: metadata.profileId,
      profileName: metadata.profileName,
      type: rejected.type,
      payload: rejected.payload,
      reason: failure.reason,
    })
    rules.splice(failure.index, 1)
    injected.splice(failure.index, 1)
    doc.rules = rules
    writeFileSync(configPath, yaml.dump(doc, { lineWidth: -1, noRefs: true }), 'utf8')
  }

  throw new Error('Profile config validation failed after removing invalid Custom Rules')
}

/** Proxy-group names from active profile base.yaml (offline-safe). */
export function getActiveProxyGroupNames(): string[] {
  return getActiveCustomRuleContext().proxyGroups
}

/** Proxy-group icon URLs from active profile base.yaml (`icon: https://...`). */
export function getProxyGroupIcons(): Record<string, string> {
  const id = getActiveProfileId()
  if (!id) return {}
  const basePath = join(profileDir(id), BASE)
  if (!existsSync(basePath)) return {}
  try {
    const doc = parseClashMapping(readFileSync(basePath, 'utf8'))
    const groups = doc['proxy-groups']
    if (!Array.isArray(groups)) return {}
    const out: Record<string, string> = {}
    for (const g of groups) {
      if (!g || typeof g !== 'object') continue
      const map = g as { name?: unknown; icon?: unknown }
      const name = typeof map.name === 'string' ? map.name : ''
      const icon = typeof map.icon === 'string' ? map.icon.trim() : ''
      if (!name || !/^https:\/\//i.test(icon)) continue
      out[name] = icon
    }
    return out
  } catch {
    return {}
  }
}

/** Validate a single PROCESS-NAME rule via YAML round-trip. */
export function validateProcessNameRule(processName: string, policy: string): string {
  const line = validateCustomRule({
    id: 'legacy-validation',
    type: 'PROCESS-NAME',
    payload: processName,
    action: policy,
    enabled: true,
    noResolve: false,
    profileIds: null,
  })
  const probe = { rules: [line] }
  const dumped = yaml.dump(probe, { lineWidth: -1, noRefs: true })
  const loaded = yaml.load(dumped)
  if (
    !loaded ||
    typeof loaded !== 'object' ||
    !Array.isArray((loaded as { rules?: unknown }).rules)
  ) {
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

function subscriptionLogOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return 'invalid-url'
  }
}

export async function importFromUrl(url: string, name?: string): Promise<ProfileMeta> {
  ensureProfilesRoot()
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Only https:// subscription URLs are allowed')
  }
  const headers = subscriptionHeaders()
  log(`importing profile from ${subscriptionLogOrigin(url)} (UA=${headers['User-Agent']})`)
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
  const updateIntervalHours = parseUpdateIntervalHours(res.headers)
  const title =
    name ||
    parseContentDispositionFilename(res.headers.get('content-disposition')) ||
    subscription.title ||
    decodeMaybeBase64Header(res.headers.get('profile-title')) ||
    decodeURIComponent(url.split('/').pop() || 'profile')
  return createProfileFromYaml(text, title, url, subscription, updateIntervalHours)
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

function managedProfileId(key: string): string {
  const safe = key
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 64)
  return safe && safe !== 'primary' ? `managed-${safe}` : MANAGED_PROFILE_ID
}

/**
 * Upsert one account-managed CheezyVPN profile, downloading YAML from its URL.
 */
export async function upsertManagedProfile(
  url: string,
  name: string,
  subscription?: SubscriptionInfo,
  managedKey = 'primary',
): Promise<ProfileMeta> {
  ensureProfilesRoot()
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Only https:// subscription URLs are allowed')
  }
  const headers = subscriptionHeaders()
  log(`upserting managed profile from ${subscriptionLogOrigin(url)}`)
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
  const updateIntervalHours = parseUpdateIntervalHours(res.headers)
  const merged: SubscriptionInfo = {
    ...fromHeaders,
    ...subscription,
    title: subscription?.title || fromHeaders.title,
    supportUrl: subscription?.supportUrl ?? fromHeaders.supportUrl,
    accentColor: subscription?.accentColor ?? fromHeaders.accentColor,
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

  const list = store.get('profiles')
  // Adopt the legacy single-profile entry when its URL matches, so upgrades
  // do not leave a duplicate profile behind after the first multi-sync.
  const existing =
    list.find((p) => p.managedKey === managedKey) ??
    list.find((p) => p.id === MANAGED_PROFILE_ID && !p.managedKey && p.url === url)
  const id = existing?.id ?? managedProfileId(managedKey)
  profileRefreshQueues.delete(id)
  const dir = profileDir(id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, BASE), text, 'utf8')

  const meta: ProfileMeta = {
    id,
    name: displayProfileName(title),
    url,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    subscription: merged,
    updateIntervalHours,
    managedKey,
  }
  const next = existing ? list.map((p) => (p.id === id ? meta : p)) : [...list, meta]
  const currentActive = getActiveProfileId()
  store.set('profiles', next)
  if (!currentActive || currentActive === id) {
    store.set('activeProfileId', id)
    rebuildConfig(id)
  } else {
    rebuildConfig(id)
  }
  return { ...meta, name: displayProfileName(meta.name) }
}

function createProfileFromYaml(
  text: string,
  name: string,
  url?: string,
  subscription?: SubscriptionInfo,
  updateIntervalHours?: number,
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
    updateIntervalHours: updateIntervalHours && updateIntervalHours > 0 ? updateIntervalHours : 0,
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

/**
 * Re-fetch subscription URL in place.
 * When reloadCore is true and this profile is active + running, soft-reload mihomo.
 * Background auto-update should pass reloadCore: false.
 */
export async function refreshProfile(
  id: string,
  opts: { reloadCore: boolean },
): Promise<ProfileMeta> {
  let queue = profileRefreshQueues.get(id)
  if (!queue) {
    queue = { tail: Promise.resolve() }
    profileRefreshQueues.set(id, queue)
  }
  const currentQueue = queue
  const pending = queue.tail
    .catch(() => undefined)
    .then(() => refreshProfileInQueue(id, opts, currentQueue))
    .finally(() => {
      if (profileRefreshQueues.get(id) === currentQueue && currentQueue.tail === pending) {
        profileRefreshQueues.delete(id)
      }
    })
  queue.tail = pending
  return pending
}

async function refreshProfileInQueue(
  id: string,
  opts: { reloadCore: boolean },
  queue: ProfileRefreshQueue,
): Promise<ProfileMeta> {
  const assertCurrent = (): void => {
    if (profileRefreshQueues.get(id) !== queue) {
      throw new Error('Profile was deleted or replaced while updating. Refresh the profile list and try again.')
    }
  }
  assertCurrent()
  const existing = store.get('profiles').find((p) => p.id === id)
  if (!existing) throw new Error('unknown profile')
  const url = existing.url
  if (!url || !/^https:\/\//i.test(url)) {
    throw new Error('Profile has no https subscription URL')
  }

  const headers = subscriptionHeaders()
  log(`refreshing profile ${id} from ${subscriptionLogOrigin(url)} (reloadCore=${opts.reloadCore})`)
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

  // Network awaits allow imports, deletion and account sync to change the store.
  // Check identity before any filesystem writes and merge into the latest list.
  assertCurrent()
  const list = store.get('profiles')
  const current = list.find((p) => p.id === id)
  if (!current || current.url !== url) {
    throw new Error('Profile was deleted or replaced while updating. Refresh the profile list and try again.')
  }

  const subscription = subscriptionFromHeaders(res.headers)
  const updateIntervalHours = parseUpdateIntervalHours(res.headers)
  const title =
    parseContentDispositionFilename(res.headers.get('content-disposition')) ||
    subscription.title ||
    current.name

  const dir = profileDir(id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, BASE), text, 'utf8')

  const meta: ProfileMeta = {
    ...current,
    name: displayProfileName(title),
    url,
    updatedAt: Date.now(),
    subscription,
    updateIntervalHours,
  }
  store.set(
    'profiles',
    list.map((p) => (p.id === id ? meta : p)),
  )
  const configPath = rebuildConfig(id)

  if (opts.reloadCore && getActiveProfileId() === id) {
    await reloadActiveCore?.(configPath, id)
  }

  return { ...meta, name: displayProfileName(meta.name) }
}

export function setActiveProfile(id: string): void {
  if (!listProfiles().some((p) => p.id === id)) throw new Error('unknown profile')
  store.set('activeProfileId', id)
}

export function deleteProfile(id: string): boolean {
  const target = store.get('profiles').find((p) => p.id === id)
  if (target?.managedKey || id === MANAGED_PROFILE_ID) {
    throw new Error('Cannot delete the managed CheezyVPN profile')
  }
  profileRefreshQueues.delete(id)
  const wasActive = getActiveProfileId() === id
  const list = store.get('profiles').filter((p) => p.id !== id)
  store.set('profiles', list)
  if (wasActive) {
    store.set('activeProfileId', list[0]?.id ?? null)
  }
  const dir = profileDir(id)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  return wasActive
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
