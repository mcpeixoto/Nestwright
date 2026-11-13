import * as esbuild from 'esbuild'
import { access, copyFile, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'

await mkdir('dist-electron', { recursive: true })
await mkdir('dist-electron/steam-resources', { recursive: true })
try {
  await access('steam_appid.txt', constants.F_OK)
  await copyFile('steam_appid.txt', 'dist-electron/steam-resources/steam_appid.txt')
} catch {
  // Packaged only when a real app id file is present. Dev uses NESTWRIGHT_STEAM=1.
}

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'steamworks.js'],
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
