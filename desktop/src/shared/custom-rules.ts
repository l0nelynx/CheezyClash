export const CUSTOM_RULE_TYPES = [
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-WILDCARD',
  'DOMAIN-REGEX',
  'IP-CIDR',
  'IP-CIDR6',
  'IP-SUFFIX',
  'IP-ASN',
  'SRC-IP-ASN',
  'SRC-IP-CIDR',
  'SRC-IP-SUFFIX',
  'DST-PORT',
  'SRC-PORT',
  'IN-PORT',
  'IN-TYPE',
  'IN-USER',
  'IN-NAME',
  'REMATCH-NAME',
  'PROCESS-PATH',
  'PROCESS-PATH-WILDCARD',
  'PROCESS-PATH-REGEX',
  'PROCESS-NAME',
  'PROCESS-NAME-WILDCARD',
  'PROCESS-NAME-REGEX',
  'UID',
  'NETWORK',
  'DSCP',
  'RULE-SET',
  'SUB-RULE',
  'MATCH',
] as const

export type CustomRuleType = (typeof CUSTOM_RULE_TYPES)[number]

export type CustomRuleCategory = 'Domain' | 'IP' | 'Ports & inbound' | 'Process' | 'Other'

export interface CustomRule {
  id: string
  type: CustomRuleType
  payload: string
  /** Clash policy/group, or the sub-rule name for SUB-RULE. */
  action: string
  enabled: boolean
  noResolve: boolean
  /** null = all profiles; otherwise only the listed stable profile IDs. */
  profileIds: string[] | null
}

export interface CustomRuleDependencyContext {
  proxyGroups: string[]
  proxyNames: string[]
  ruleSets: string[]
  subRules: string[]
  profileId: string | null
  resolvedProxyTarget: string | null
}

export interface CustomRuleProfileContext extends CustomRuleDependencyContext {
  id: string
  name: string
}

export interface CustomRuleContext extends CustomRuleDependencyContext {
  activeProfileId: string | null
  profiles: CustomRuleProfileContext[]
  platform: 'windows' | 'darwin' | 'linux'
}

export type CustomRuleAvailability =
  | { kind: 'available'; resolvedAction: string }
  | { kind: 'out-of-scope'; reason: string }
  | { kind: 'unavailable'; reason: string }

export interface CustomRuleDiagnostic {
  ruleId: string
  profileId: string
  profileName: string
  type: CustomRuleType
  payload: string
  reason: string
}

export interface CustomRuleDefinition {
  category: CustomRuleCategory
  targetLabel: string
  placeholder: string
  hint: string
  noPayload?: boolean
  noResolve?: boolean
}

const definitions: Record<CustomRuleType, CustomRuleDefinition> = {
  DOMAIN: {
    category: 'Domain',
    targetLabel: 'Full domain name',
    placeholder: 'api.example.com',
    hint: 'Matches one full domain name, for example api.example.com.',
  },
  'DOMAIN-SUFFIX': {
    category: 'Domain',
    targetLabel: 'Domain suffix',
    placeholder: 'example.com',
    hint: 'Matches the suffix and its subdomains, for example example.com.',
  },
  'DOMAIN-KEYWORD': {
    category: 'Domain',
    targetLabel: 'Domain keyword',
    placeholder: 'google',
    hint: 'Matches domain names containing this keyword.',
  },
  'DOMAIN-WILDCARD': {
    category: 'Domain',
    targetLabel: 'Domain wildcard',
    placeholder: '*.example.com',
    hint: 'Use * for zero or more characters and ? for exactly one character.',
  },
  'DOMAIN-REGEX': {
    category: 'Domain',
    targetLabel: 'Domain regular expression',
    placeholder: '^api\\..*\\.com$',
    hint: 'Regular expression matched against the domain name.',
  },
  'IP-CIDR': {
    category: 'IP',
    targetLabel: 'Target IP range',
    placeholder: '192.0.2.0/24',
    hint: 'CIDR range of the target IP address.',
    noResolve: true,
  },
  'IP-CIDR6': {
    category: 'IP',
    targetLabel: 'Target IPv6 range',
    placeholder: '2001:db8::/32',
    hint: 'IPv6 CIDR range of the target IP address.',
    noResolve: true,
  },
  'IP-SUFFIX': {
    category: 'IP',
    targetLabel: 'Target IP suffix range',
    placeholder: '8.8.8.8/24',
    hint: 'Suffix range matched against the target IP address.',
    noResolve: true,
  },
  'IP-ASN': {
    category: 'IP',
    targetLabel: 'Target IP ASN',
    placeholder: '13335',
    hint: 'Autonomous System Number of the target IP address.',
    noResolve: true,
  },
  'SRC-IP-ASN': {
    category: 'IP',
    targetLabel: 'Source IP ASN',
    placeholder: '9808',
    hint: 'Autonomous System Number of the source IP address.',
  },
  'SRC-IP-CIDR': {
    category: 'IP',
    targetLabel: 'Source IP range',
    placeholder: '192.168.1.0/24',
    hint: 'CIDR range of the source IP address.',
  },
  'SRC-IP-SUFFIX': {
    category: 'IP',
    targetLabel: 'Source IP suffix range',
    placeholder: '192.168.1.201/8',
    hint: 'Suffix range matched against the source IP address.',
  },
  'DST-PORT': {
    category: 'Ports & inbound',
    targetLabel: 'Target port range',
    placeholder: '443/8443-8450',
    hint: 'Use - for a range and / or , to separate ports and ranges.',
  },
  'SRC-PORT': {
    category: 'Ports & inbound',
    targetLabel: 'Source port range',
    placeholder: '1024-65535',
    hint: 'Source port or range; use - for a range and / or , to separate values.',
  },
  'IN-PORT': {
    category: 'Ports & inbound',
    targetLabel: 'Inbound port range',
    placeholder: '7890/7891',
    hint: 'Inbound port or range; use - for a range and / or , to separate values.',
  },
  'IN-TYPE': {
    category: 'Ports & inbound',
    targetLabel: 'Inbound type',
    placeholder: 'SOCKS/HTTP',
    hint: 'Inbound listener type; separate multiple types with /.',
  },
  'IN-USER': {
    category: 'Ports & inbound',
    targetLabel: 'Inbound username',
    placeholder: 'alice/bob',
    hint: 'Inbound username; separate multiple usernames with /.',
  },
  'IN-NAME': {
    category: 'Ports & inbound',
    targetLabel: 'Inbound name',
    placeholder: 'mixed-in',
    hint: 'Name of the inbound listener.',
  },
  'REMATCH-NAME': {
    category: 'Ports & inbound',
    targetLabel: 'Rematch name',
    placeholder: 'rematch1',
    hint: 'Name written by a rematch outbound proxy.',
  },
  'PROCESS-PATH': {
    category: 'Process',
    targetLabel: 'Full process path',
    placeholder: 'C:\\Program Files\\App\\app.exe',
    hint: 'Exact full path of the process executable.',
  },
  'PROCESS-PATH-WILDCARD': {
    category: 'Process',
    targetLabel: 'Process path wildcard',
    placeholder: 'C:\\Program Files\\App\\*',
    hint: 'Process path pattern using * and ? wildcards.',
  },
  'PROCESS-PATH-REGEX': {
    category: 'Process',
    targetLabel: 'Process path regular expression',
    placeholder: '(?i).*Application\\\\chrome.*',
    hint: 'Regular expression matched against the full process path.',
  },
  'PROCESS-NAME': {
    category: 'Process',
    targetLabel: 'Process name',
    placeholder: 'Discord.exe',
    hint: 'Exact executable name. You can also pick a running process.',
  },
  'PROCESS-NAME-WILDCARD': {
    category: 'Process',
    targetLabel: 'Process name wildcard',
    placeholder: '*telegram*',
    hint: 'Process name pattern using * and ? wildcards.',
  },
  'PROCESS-NAME-REGEX': {
    category: 'Process',
    targetLabel: 'Process name regular expression',
    placeholder: '(?i)telegram',
    hint: 'Regular expression matched against the process name.',
  },
  UID: {
    category: 'Other',
    targetLabel: 'Linux user ID',
    placeholder: '1000',
    hint: 'Numeric Linux user ID that owns the process.',
  },
  NETWORK: {
    category: 'Other',
    targetLabel: 'Network protocol',
    placeholder: 'tcp',
    hint: 'Select tcp or udp.',
  },
  DSCP: {
    category: 'Other',
    targetLabel: 'DSCP tag',
    placeholder: '4',
    hint: 'DSCP tag from 0 to 63; used by tproxy UDP inbound traffic.',
  },
  'RULE-SET': {
    category: 'Other',
    targetLabel: 'Rule set',
    placeholder: 'streaming',
    hint: 'Choose a rule-provider from the active profile.',
  },
  'SUB-RULE': {
    category: 'Other',
    targetLabel: 'Match condition',
    placeholder: '(NETWORK,tcp)',
    hint: 'One parenthesized condition, for example (NETWORK,tcp).',
  },
  MATCH: {
    category: 'Other',
    targetLabel: 'Target',
    placeholder: '',
    hint: 'Matches all remaining traffic. Profile rules below it will not be reached.',
    noPayload: true,
  },
}

const allowedTypes = new Set<string>(CUSTOM_RULE_TYPES)
const portTypes = new Set<CustomRuleType>(['DST-PORT', 'SRC-PORT', 'IN-PORT'])
const asnTypes = new Set<CustomRuleType>(['IP-ASN', 'SRC-IP-ASN'])
const cidrTypes = new Set<CustomRuleType>([
  'IP-CIDR',
  'IP-CIDR6',
  'IP-SUFFIX',
  'SRC-IP-CIDR',
  'SRC-IP-SUFFIX',
])
const regexTypes = new Set<CustomRuleType>([
  'DOMAIN-REGEX',
  'PROCESS-PATH-REGEX',
  'PROCESS-NAME-REGEX',
])

export function customRuleDefinition(type: CustomRuleType): CustomRuleDefinition {
  return definitions[type]
}

export function isCustomRuleType(value: unknown): value is CustomRuleType {
  return typeof value === 'string' && allowedTypes.has(value)
}

export function policyToClash(policy: string): string {
  return policy === 'BLOCK' ? 'REJECT' : policy
}

export function clashToPolicyLabel(policy: string): string {
  return policy === 'REJECT' ? 'BLOCK' : policy
}

export function normalizeCustomRules(rawRules: unknown, legacyRules?: unknown): CustomRule[] {
  const source = Array.isArray(rawRules) ? rawRules : Array.isArray(legacyRules) ? legacyRules : []

  const out: CustomRule[] = []
  source.forEach((value, index) => {
    if (!value || typeof value !== 'object') return
    const raw = value as Record<string, unknown>
    const legacyProcessName = typeof raw.processName === 'string' ? raw.processName : ''
    const type = isCustomRuleType(raw.type) ? raw.type : legacyProcessName ? 'PROCESS-NAME' : null
    if (!type) return
    const payload = typeof raw.payload === 'string' ? raw.payload : legacyProcessName
    const legacyPolicy = typeof raw.policy === 'string' ? raw.policy : ''
    const action = policyToClash(typeof raw.action === 'string' ? raw.action : legacyPolicy)
    const id = typeof raw.id === 'string' && raw.id ? raw.id : `migrated-rule-${index + 1}`
    out.push({
      id,
      type,
      payload: definitions[type].noPayload ? '' : payload,
      action,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      noResolve: definitions[type].noResolve === true && raw.noResolve === true,
      profileIds:
        raw.profileIds === null
          ? null
          : Array.isArray(raw.profileIds)
            ? [
                ...new Set(
                  raw.profileIds
                    .filter((item): item is string => typeof item === 'string')
                    .map((item) => item.trim())
                    .filter(Boolean),
                ),
              ]
            : null,
    })
  })
  return out
}

export function resolveProxyTarget(context: CustomRuleDependencyContext): string | null {
  if (context.proxyGroups.includes('PROXY') || context.proxyNames.includes('PROXY')) return 'PROXY'
  return context.proxyGroups[0] ?? context.proxyNames[0] ?? null
}

function subRuleProviderName(payload: string): string | null {
  const match = /^\(RULE-SET,([^()]+)\)$/i.exec(payload.trim())
  return match?.[1]?.trim() || null
}

export function customRuleAvailability(
  rule: CustomRule,
  context: CustomRuleDependencyContext,
): CustomRuleAvailability {
  if (rule.profileIds !== null && !context.profileId) {
    return { kind: 'out-of-scope', reason: 'No active profile' }
  }
  if (rule.profileIds !== null && !rule.profileIds.includes(context.profileId!)) {
    return { kind: 'out-of-scope', reason: 'Not selected for this profile' }
  }

  if (rule.type === 'RULE-SET' && !context.ruleSets.includes(rule.payload.trim())) {
    return { kind: 'unavailable', reason: `Rule provider “${rule.payload.trim()}” not found` }
  }
  if (rule.type === 'SUB-RULE') {
    if (!context.subRules.includes(rule.action.trim())) {
      return { kind: 'unavailable', reason: `Sub-rule “${rule.action.trim()}” not found` }
    }
    const nestedProvider = subRuleProviderName(rule.payload)
    if (nestedProvider && !context.ruleSets.includes(nestedProvider)) {
      return { kind: 'unavailable', reason: `Rule provider “${nestedProvider}” not found` }
    }
    return { kind: 'available', resolvedAction: rule.action.trim() }
  }

  const action = policyToClash(rule.action.trim())
  if (action === 'DIRECT' || action === 'REJECT') {
    return { kind: 'available', resolvedAction: action }
  }
  if (action === 'PROXY') {
    const target = resolveProxyTarget(context)
    return target
      ? { kind: 'available', resolvedAction: target }
      : { kind: 'unavailable', reason: 'Profile has no proxy group or proxy' }
  }
  if (context.proxyGroups.includes(action)) {
    return { kind: 'available', resolvedAction: action }
  }
  return { kind: 'unavailable', reason: `Proxy group “${action}” not found` }
}

export function isCustomRuleAvailable(
  rule: CustomRule,
  context: CustomRuleDependencyContext,
): boolean {
  return customRuleAvailability(rule, context).kind === 'available'
}

function validatePortRange(payload: string): void {
  const parts = payload.split(/[\/,]/).map((part) => part.trim())
  if (parts.length === 0 || parts.some((part) => !part)) {
    throw new Error('Enter one or more ports or port ranges')
  }
  for (const part of parts) {
    const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part)
    if (!match) throw new Error(`Invalid port or range: ${part}`)
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    if (start < 1 || end > 65535 || start > end) {
      throw new Error(`Port range must be within 1-65535: ${part}`)
    }
  }
}

function validateRegex(payload: string): void {
  try {
    const caseInsensitive = payload.startsWith('(?i)')
    new RegExp(caseInsensitive ? payload.slice(4) : payload, caseInsensitive ? 'i' : undefined)
  } catch {
    throw new Error('Enter a valid regular expression')
  }
}

export function validateCustomRule(rule: CustomRule): string {
  if (!isCustomRuleType(rule.type)) throw new Error('Unsupported rule type')
  const definition = definitions[rule.type]
  const payload = rule.payload.trim()
  const action = rule.action.trim()

  if (!definition.noPayload && !payload) throw new Error(`${definition.targetLabel} is required`)
  if (!action)
    throw new Error(rule.type === 'SUB-RULE' ? 'Sub-rule is required' : 'Policy is required')
  if (action.includes(',')) throw new Error('Policy and sub-rule names must not contain commas')
  if (rule.profileIds !== null && rule.profileIds.length === 0) {
    throw new Error('Select at least one profile or use All profiles')
  }

  if (portTypes.has(rule.type)) validatePortRange(payload)
  if (asnTypes.has(rule.type) && !/^\d+$/.test(payload)) throw new Error('ASN must be a number')
  if (cidrTypes.has(rule.type) && !/^\S+\/\d{1,3}$/.test(payload)) {
    throw new Error('Enter an IP range in CIDR notation')
  }
  if (regexTypes.has(rule.type)) validateRegex(payload)
  if (rule.type === 'UID' && !/^\d+$/.test(payload)) throw new Error('UID must be a number')
  if (rule.type === 'DSCP' && (!/^\d+$/.test(payload) || Number(payload) > 63)) {
    throw new Error('DSCP must be a number from 0 to 63')
  }
  if (rule.type === 'NETWORK' && !/^(tcp|udp)$/i.test(payload)) {
    throw new Error('Network must be tcp or udp')
  }
  if (rule.type === 'SUB-RULE') {
    if (!/^\([^()]+,[^()]+\)$/.test(payload)) {
      throw new Error('Enter one parenthesized condition, for example (NETWORK,tcp)')
    }
    if (/^\((?:AND|OR|NOT|GEOIP|SRC-GEOIP|GEOSITE),/i.test(payload)) {
      throw new Error('Composite and Geo conditions are not supported')
    }
  } else if (!portTypes.has(rule.type) && payload.includes(',')) {
    throw new Error('This target must not contain commas')
  }

  return serializeCustomRule(rule)
}

export function serializeCustomRule(rule: CustomRule, resolvedAction?: string): string {
  const payload = rule.payload.trim()
  const action = resolvedAction ?? policyToClash(rule.action.trim())
  const parts = definitions[rule.type].noPayload
    ? [rule.type, action]
    : [rule.type, payload, action]
  if (definitions[rule.type].noResolve && rule.noResolve) parts.push('no-resolve')
  return parts.join(',')
}
