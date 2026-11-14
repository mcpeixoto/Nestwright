import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import { sha256File } from './hash.mjs'
import { paths } from './paths.mjs'

export async function outputRecord(abs) {
  const info = await stat(abs)
  return {
    path: relative(paths.output, abs).split(sep).join('/'),
    bytes: info.size,
    sha256: await sha256File(abs),
  }
}

export function commandExists(cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}
