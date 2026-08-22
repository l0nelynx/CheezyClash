import { platform as hostPlatform } from 'os'
import type {
  CustomRule,
  CustomRuleContext,
  CustomRuleDiagnostic,
  CustomRuleType,
} from '../shared/custom-rules.ts'
import {
  customRuleAvailability,
  resolveProxyTarget,
  serializeCustomRule,
  validateCustomRule,
} from '../shared/custom-rules.ts'

export interface InjectedCustomRule {
  id: string
  type: CustomRuleType
  payload: string
  line: string
}

export interface CustomRuleApplyResult {
  injected: InjectedCustomRule[]
  skipped: CustomRuleDiagnostic[]
}

export interface ParsedRuleFailure {
  index: number
  reason: string
}

/** Parse the indexed rule error emitted by `mihomo -t`. */
export function parseRuleFailure(output: string): ParsedRuleFailure | null {
  const match = output.match(/rules\[(\d+)\].*?error:\s*([^\r\n"]+)/i)
  if (!match) return null
  return {
    index: Number(match[1]),
    reason: match[2]?.trim() || 'Rule was rejected by the core',
  }
}

export function customRulePlatform(): CustomRuleContext['platform'] {
  const current = hostPlatform()
  return current === 'win32' ? 'windows' : current === 'darwin' ? 'darwin' : 'linux'
}

export function emptyCustomRuleContext(): CustomRuleContext {
  return {
    proxyGroups: [],
    proxyNames: [],
    ruleSets: [],
    subRules: [],
    profileId: null,
    resolvedProxyTarget: null,
    activeProfileId: null,
    profiles: [],
    platform: customRulePlatform(),
  }
}

function mappingKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b))
}

function sequenceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const names: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const name = (item as { name?: unknown }).name
    if (typeof name === 'string' && name.trim()) names.push(name.trim())
  }
  return [...new Set(names)]
}

export function customRuleContextFromDocument(
  doc: Record<string, unknown>,
  profile: { id?: string | null; name?: string } = {},
): CustomRuleContext {
  const proxyGroups: string[] = []
  const groups = doc['proxy-groups']
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!group || typeof group !== 'object') continue
      const name = (group as { name?: unknown }).name
      if (typeof name === 'string' && name.trim()) proxyGroups.push(name.trim())
    }
  }
  const context: CustomRuleContext = {
    proxyGroups: [...new Set(proxyGroups)],
    proxyNames: sequenceNames(doc.proxies),
    ruleSets: mappingKeys(doc['rule-providers']),
    subRules: mappingKeys(doc['sub-rules']),
    profileId: profile.id ?? null,
    resolvedProxyTarget: null,
    activeProfileId: profile.id ?? null,
    profiles: [],
    platform: customRulePlatform(),
  }
  context.resolvedProxyTarget = resolveProxyTarget(context)
  return context
}

/** Prepend enabled, valid and profile-available Custom Rules in saved priority order. */
export function applyCustomRules(
  doc: Record<string, unknown>,
  rules: CustomRule[],
  profile: { id?: string | null; name?: string } = {},
): CustomRuleApplyResult {
  const context = customRuleContextFromDocument(doc, profile)
  const injected: InjectedCustomRule[] = []
  const skipped: CustomRuleDiagnostic[] = []

  for (const rule of rules) {
    if (!rule.enabled) continue
    const availability = customRuleAvailability(rule, context)
    if (availability.kind === 'out-of-scope') continue
    if (availability.kind === 'unavailable') {
      skipped.push({
        ruleId: rule.id,
        profileId: profile.id ?? '',
        profileName: profile.name ?? 'Active profile',
        type: rule.type,
        payload: rule.payload,
        reason: availability.reason,
      })
      continue
    }
    try {
      validateCustomRule(rule)
      injected.push({
        id: rule.id,
        type: rule.type,
        payload: rule.payload,
        line: serializeCustomRule(rule, availability.resolvedAction),
      })
    } catch (error) {
      skipped.push({
        ruleId: rule.id,
        profileId: profile.id ?? '',
        profileName: profile.name ?? 'Active profile',
        type: rule.type,
        payload: rule.payload,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const existing = Array.isArray(doc.rules)
    ? (doc.rules as unknown[]).filter((value): value is string => typeof value === 'string')
    : []
  doc.rules = [...injected.map((rule) => rule.line), ...existing]
  return { injected, skipped }
}
