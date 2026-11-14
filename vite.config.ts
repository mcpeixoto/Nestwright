import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { threeAlias } from './vite.three'

/**
 * Vite copies all of public/ into dist/, which would put the ~350 MB content pack inside the
 * asar. The packaged app ships it as extraResources instead, so drop the copy after a build.
 */
function dropContentPack(): Plugin {
  let outDir = 'dist'
  return {
    name: 'nestwright-drop-content-pack',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      rmSync(resolve(outDir, 'content'), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), dropContentPack()],
  // Relative asset paths so dist/index.html loads under file:// in Electron.
  base: './',
  resolve: { alias: threeAlias },
  build: {
    outDir: 'dist',
  },
})
