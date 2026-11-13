import * as esbuild from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('dist-electron', { recursive: true })

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
}

await esbuild.build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
})

await esbuild.build({
  ...shared,
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
})
