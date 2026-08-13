import assert from 'node:assert/strict'

import {
  decodeMaybeBase64Header,
  parseAccentColorHeader,
  parseHttpUrlHeader,
  subscriptionFromHeaders,
} from '../src/main/subscription-metadata.ts'

assert.equal(decodeMaybeBase64Header('base64:Q2hlZXp5IFBybw=='), 'Cheezy Pro')
assert.equal(parseHttpUrlHeader('https://example.com/support'), 'https://example.com/support')
assert.equal(
  parseHttpUrlHeader('base64:aHR0cHM6Ly90Lm1lL2NoZWV6eQ=='),
  'https://t.me/cheezy',
)
assert.equal(parseHttpUrlHeader('javascript:alert(1)'), undefined)
assert.equal(parseHttpUrlHeader('not a url'), undefined)

assert.equal(parseAccentColorHeader('#FBFF00'), '#fbff00')
assert.equal(parseAccentColorHeader('#fff'), undefined)
assert.equal(parseAccentColorHeader('fbff00'), undefined)
assert.equal(parseAccentColorHeader('#ggff00'), undefined)

const headers = new Headers({
  'profile-title': 'base64:Q2hlZXp5IFBybw==',
  'support-url': 'https://example.com/help',
  'cheezy-accent': '#FBFF00',
  'subscription-userinfo': 'upload=10; download=20; total=100; expire=1234',
})
assert.deepEqual(subscriptionFromHeaders(headers), {
  title: 'Cheezy Pro',
  announce: undefined,
  tag: undefined,
  supportUrl: 'https://example.com/help',
  accentColor: '#fbff00',
  upload: 10,
  download: 20,
  total: 100,
  expire: 1234,
})

console.log('desktop subscription metadata tests passed')
