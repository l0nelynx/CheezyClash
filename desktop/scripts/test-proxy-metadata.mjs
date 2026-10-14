import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { proxyMetadataFromDocument, proxyNodeInfo } from '../src/main/proxy-metadata.ts'

const doc = yaml.load(`
proxies:
  - name: Node
    type: vless
    network: grpc
    serverDescription: |
      First line
      Second line
    server: private.example
    uuid: PRIVATE_UUID
  - name: UDP node
    type: hysteria2
  - name: TCP node
    type: trojan
  - name: Invalid fields
    type: [vless]
    network: {secret: PRIVATE_KEY}
    serverDescription: 123
  - null
proxy-providers:
  inline:
    payload:
      - name: Inline node
        type: ss
        serverDescription: Provider description
`)
const metadata = proxyMetadataFromDocument(doc)
assert.deepEqual(metadata.Node, {type:'vless',network:'grpc',serverDescription:'First line\nSecond line'})
assert.deepEqual(metadata['UDP node'],{type:'hysteria2',network:'udp'})
assert.deepEqual(metadata['TCP node'],{type:'trojan',network:'tcp'})
assert.deepEqual(metadata['Invalid fields'],{})
assert.equal(metadata['Inline node'].serverDescription,'Provider description')
assert.equal(JSON.stringify(metadata).includes('PRIVATE'),false)
assert.equal(JSON.stringify(metadata).includes('private.example'),false)
assert.deepEqual(proxyNodeInfo(null),{})
assert.deepEqual(proxyNodeInfo({type:'Direct'}),{type:'Direct'})
assert.deepEqual(proxyNodeInfo({type:'Vless',network:' ',serverDescription:' '}),{type:'Vless',network:'tcp'})
assert.deepEqual(proxyNodeInfo({type:'Unknown'}),{type:'Unknown'})
assert.equal(Object.keys(proxyMetadataFromDocument({proxies:'invalid'})).length,0)
console.log('Proxy metadata tests passed: YAML descriptions, transports, inline providers, invalid fields and presentation-only data')
