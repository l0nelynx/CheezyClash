import assert from 'node:assert/strict'

import {
  CUSTOM_RULE_TYPES,
  normalizeCustomRules,
  serializeCustomRule,
  validateCustomRule,
} from '../src/shared/custom-rules.ts'
import { normalizeSettings } from '../src/shared/types.ts'
import {
  applyCustomRules,
  customRuleContextFromDocument,
  parseRuleFailure,
} from '../src/main/custom-rules-config.ts'

const payloads = {
  DOMAIN: 'api.example.com',
  'DOMAIN-SUFFIX': 'example.com',
  'DOMAIN-KEYWORD': 'google',
  'DOMAIN-WILDCARD': '*.example.com',
  'DOMAIN-REGEX': '^api\\..*\\.com$',
  'IP-CIDR': '192.0.2.0/24',
  'IP-CIDR6': '2001:db8::/32',
  'IP-SUFFIX': '8.8.8.8/24',
  'IP-ASN': '13335',
  'SRC-IP-ASN': '9808',
  'SRC-IP-CIDR': '192.168.1.0/24',
  'SRC-IP-SUFFIX': '192.168.1.201/8',
  'DST-PORT': '114-514/810-1919,65530',
  'SRC-PORT': '1024-65535',
  'IN-PORT': '7890/7891',
  'IN-TYPE': 'SOCKS/HTTP',
  'IN-USER': 'alice/bob',
  'IN-NAME': 'mixed-in',
  'REMATCH-NAME': 'rematch1',
  'PROCESS-PATH': 'C:\\Program Files\\App\\app.exe',
  'PROCESS-PATH-WILDCARD': 'C:\\Program Files\\App\\*',
  'PROCESS-PATH-REGEX': '(?i).*Application\\\\chrome.*',
  'PROCESS-NAME': 'Discord.exe',
  'PROCESS-NAME-WILDCARD': '*telegram*',
  'PROCESS-NAME-REGEX': '(?i)telegram',
  UID: '1000',
  NETWORK: 'tcp',
  DSCP: '4',
  'RULE-SET': 'streaming',
  'SUB-RULE': '(NETWORK,tcp)',
  MATCH: '',
}

assert.deepEqual(Object.keys(payloads).sort(), [...CUSTOM_RULE_TYPES].sort())
for (const type of CUSTOM_RULE_TYPES) {
  const rule = {
    id: `rule-${type}`,
    type,
    payload: payloads[type],
    action: type === 'SUB-RULE' ? 'tcp-only' : 'DIRECT',
    enabled: true,
    noResolve: type === 'IP-CIDR',
    profileIds: null,
  }
  assert.equal(validateCustomRule(rule), serializeCustomRule(rule), type)
}

assert.equal(
  validateCustomRule({
    id: 'blocked',
    type: 'DOMAIN',
    payload: 'ads.example',
    action: 'BLOCK',
    enabled: true,
    noResolve: false,
    profileIds: null,
  }),
  'DOMAIN,ads.example,REJECT',
)
assert.equal(
  validateCustomRule({
    id: 'ports',
    type: 'DST-PORT',
    payload: '114-514/810-1919,65530',
    action: 'DIRECT',
    enabled: true,
    noResolve: false,
    profileIds: null,
  }),
  'DST-PORT,114-514/810-1919,65530,DIRECT',
)
assert.equal(
  validateCustomRule({
    id: 'ip',
    type: 'IP-CIDR',
    payload: '127.0.0.0/8',
    action: 'DIRECT',
    enabled: true,
    noResolve: true,
    profileIds: null,
  }),
  'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
)
assert.equal(
  validateCustomRule({
    id: 'match',
    type: 'MATCH',
    payload: 'ignored',
    action: 'PROXY',
    enabled: true,
    noResolve: false,
    profileIds: null,
  }),
  'MATCH,PROXY',
)
assert.equal(
  validateCustomRule({
    id: 'sub',
    type: 'SUB-RULE',
    payload: '(NETWORK,tcp)',
    action: 'tcp-only',
    enabled: true,
    noResolve: false,
    profileIds: null,
  }),
  'SUB-RULE,(NETWORK,tcp),tcp-only',
)
assert.throws(
  () =>
    validateCustomRule({
      id: 'logic',
      type: 'SUB-RULE',
      payload: '(AND,x)',
      action: 'tcp-only',
      enabled: true,
      noResolve: false,
      profileIds: null,
    }),
  /not supported/,
)
assert.throws(
  () =>
    validateCustomRule({
      id: 'ports',
      type: 'DST-PORT',
      payload: '65536',
      action: 'DIRECT',
      enabled: true,
      noResolve: false,
      profileIds: null,
    }),
  /1-65535/,
)

const migrated = normalizeCustomRules(undefined, [
  { id: 'legacy-1', processName: 'Discord.exe', policy: 'REJECT' },
  { id: 'legacy-2', processName: 'curl', policy: 'BLOCK' },
])
assert.deepEqual(migrated, [
  {
    id: 'legacy-1',
    type: 'PROCESS-NAME',
    payload: 'Discord.exe',
    action: 'REJECT',
    enabled: true,
    noResolve: false,
    profileIds: null,
  },
  {
    id: 'legacy-2',
    type: 'PROCESS-NAME',
    payload: 'curl',
    action: 'REJECT',
    enabled: true,
    noResolve: false,
    profileIds: null,
  },
])
const migratedSettings = normalizeSettings({
  accessControlRules: [{ id: 'legacy-1', processName: 'Discord.exe', policy: 'DIRECT' }],
})
assert.equal(migratedSettings.customRules[0]?.id, 'legacy-1')
assert.equal(Object.hasOwn(migratedSettings, 'accessControlRules'), false)

const base = {
  'proxy-groups': [{ name: 'Auto' }, { name: 'Auto' }, { name: 'Fallback' }],
  proxies: [{ name: 'Node A' }],
  'rule-providers': { streaming: {}, ads: {} },
  'sub-rules': { 'tcp-only': [] },
  rules: ['MATCH,Auto'],
}
const context = customRuleContextFromDocument(structuredClone(base))
assert.deepEqual(context.proxyGroups, ['Auto', 'Fallback'])
assert.deepEqual(context.proxyNames, ['Node A'])
assert.equal(context.resolvedProxyTarget, 'Auto')
assert.deepEqual(context.ruleSets, ['ads', 'streaming'])
assert.deepEqual(context.subRules, ['tcp-only'])

const orderedRules = [
  {
    id: 'first',
    type: 'DOMAIN',
    payload: 'example.com',
    action: 'BLOCK',
    enabled: true,
    noResolve: false,
    profileIds: null,
  },
  {
    id: 'disabled',
    type: 'PROCESS-NAME',
    payload: 'curl',
    action: 'DIRECT',
    enabled: false,
    noResolve: false,
    profileIds: null,
  },
  {
    id: 'missing-set',
    type: 'RULE-SET',
    payload: 'missing',
    action: 'PROXY',
    enabled: true,
    noResolve: false,
    profileIds: null,
  },
  {
    id: 'missing-policy',
    type: 'DOMAIN-SUFFIX',
    payload: 'example.net',
    action: 'Gone',
    enabled: true,
    noResolve: false,
    profileIds: null,
  },
  {
    id: 'set',
    type: 'RULE-SET',
    payload: 'streaming',
    action: 'Auto',
    enabled: true,
    noResolve: false,
    profileIds: null,
  },
  {
    id: 'scoped-elsewhere',
    type: 'DOMAIN',
    payload: 'elsewhere.example',
    action: 'DIRECT',
    enabled: true,
    noResolve: false,
    profileIds: ['profile-b'],
  },
]
const generatedA = structuredClone(base)
const generatedB = structuredClone(base)
const appliedA = applyCustomRules(generatedA, orderedRules, { id: 'profile-a', name: 'Profile A' })
const appliedB = applyCustomRules(generatedB, orderedRules, { id: 'profile-a', name: 'Profile A' })
assert.deepEqual(generatedA, generatedB)
assert.deepEqual(generatedA.rules, [
  'DOMAIN,example.com,REJECT',
  'RULE-SET,streaming,Auto',
  'MATCH,Auto',
])
assert.deepEqual(appliedA, appliedB)
assert.deepEqual(
  appliedA.skipped.map((diagnostic) => diagnostic.ruleId),
  ['missing-set', 'missing-policy'],
)

const virtualProxyRule = {
  id: 'virtual-proxy',
  type: 'DOMAIN',
  payload: 'proxy.example',
  action: 'PROXY',
  enabled: true,
  noResolve: false,
  profileIds: null,
}

const literalProxyGroup = {
  'proxy-groups': [{ name: 'PROXY' }, { name: 'Auto' }],
  proxies: [{ name: 'Node A' }],
  rules: [],
}
applyCustomRules(literalProxyGroup, [virtualProxyRule], { id: 'literal' })
assert.deepEqual(literalProxyGroup.rules, ['DOMAIN,proxy.example,PROXY'])

const firstGroup = {
  'proxy-groups': [{ name: 'Main' }, { name: 'Fallback' }],
  proxies: [{ name: 'Node A' }],
  rules: [],
}
applyCustomRules(firstGroup, [virtualProxyRule], { id: 'groups' })
assert.deepEqual(firstGroup.rules, ['DOMAIN,proxy.example,Main'])

const firstProxy = { proxies: [{ name: 'Node A' }, { name: 'Node B' }], rules: [] }
applyCustomRules(firstProxy, [virtualProxyRule], { id: 'proxies' })
assert.deepEqual(firstProxy.rules, ['DOMAIN,proxy.example,Node A'])

const noProxy = { rules: [] }
const noProxyResult = applyCustomRules(noProxy, [virtualProxyRule], {
  id: 'empty',
  name: 'Empty',
})
assert.deepEqual(noProxy.rules, [])
assert.match(noProxyResult.skipped[0]?.reason ?? '', /no proxy group or proxy/i)

assert.deepEqual(
  parseRuleFailure(
    'level=error msg="rules[0] [DOMAIN,example.com,Missing Group] error: proxy [Missing Group] not found"',
  ),
  { index: 0, reason: 'proxy [Missing Group] not found' },
)
assert.equal(parseRuleFailure('configuration file test failed'), null)

assert.throws(
  () => validateCustomRule({ ...virtualProxyRule, profileIds: [] }),
  /Select at least one profile/,
)

console.log('desktop custom rules tests passed')
