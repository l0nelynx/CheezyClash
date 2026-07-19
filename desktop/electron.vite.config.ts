import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// @rolldown/plugin-babel returns a Promise; await before electron-vite deepClone.
const reactCompilerBabel = await babel({ presets: [reactCompilerPreset()] })

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
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
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), reactCompilerBabel, tailwindcss()],
  },
})
