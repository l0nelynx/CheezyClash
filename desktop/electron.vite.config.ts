import { readFileSync } from 'node:fs'
import { createPublicKey } from 'node:crypto'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// @rolldown/plugin-babel returns a Promise; await before electron-vite deepClone.
const reactCompilerBabel = await babel({ presets: [reactCompilerPreset()] })

const edition = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).productName
if (!['CheezyClash', 'CheezyVPN'].includes(edition)) throw new Error('Unknown desktop edition')
const configuredKey = process.env.DESKTOP_UPDATE_PUBLIC_KEY
if (configuredKey && !configuredKey.trimStart().startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('Expected a public update key')
const key = configuredKey ? createPublicKey(configuredKey) : undefined
if (key && key.asymmetricKeyType !== 'ed25519') throw new Error('Expected Ed25519 update key')
const publicKey = key?.export({ type: 'spki', format: 'pem' }).toString() ?? ''
if (process.env.DESKTOP_UPDATE_RELEASE === 'true' && !publicKey) throw new Error('Missing desktop update public key')

export default defineConfig({
  main: {
    define: { __UPDATE_EDITION__: JSON.stringify(edition), __UPDATE_PUBLIC_KEY__: JSON.stringify(publicKey) },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'live-ui': resolve('src/main/live-ui.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    // Keep the dev server and Electron on the same loopback address on Windows.
    server: { host: '127.0.0.1' },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), reactCompilerBabel, tailwindcss()],
  },
})
