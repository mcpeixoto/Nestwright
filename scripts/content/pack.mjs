#!/usr/bin/env node
/**
 * Tar public/content into content-vN.tar.zst (or .tar.gz) and record the sha256.
 */
import { spawn } from 'node:child_process'
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { log, parseArgs, run } from './lib/cli.mjs'
import { writeIndexFile } from './lib/contentIndex.mjs'
import { sha256File } from './lib/hash.mjs'
import { nextArchive } from './lib/lock.mjs'
import { commandExists } from './lib/output.mjs'
import { paths } from './lib/paths.mjs'

const HELP = `node scripts/content/pack.mjs [--dry-run] [--gzip]

Archive public/content as content-vN.tar.zst when zstd is installed, otherwise
(or with --gzip, which any tar can extract) content-vN.tar.gz. Writes the filename and sha256 to content/lock.json.
The archive root is the content/ directory, so it extracts into public/content.
`

function pipe(fromCmd, fromArgs, toCmd, toArgs) {
  return new Promise((resolve, reject) => {
    const left = spawn(fromCmd, fromArgs, { stdio: ['ignore', 'pipe', 'inherit'] })
    const right = spawn(toCmd, toArgs, { stdio: ['pipe', 'inherit', 'inherit'] })
    left.stdout.pipe(right.stdin)
    let pending = 2
    let failed = false
    const finish = (code, cmd) => {
      if (failed) return
      if (code !== 0) {
        failed = true
        reject(new Error(`${cmd} exited ${code}`))
        return
      }
      pending -= 1
      if (pending === 0) resolve()
    }
    left.on('error', (error) => {
      failed = true
      reject(error)
    })
    right.on('error', (error) => {
      failed = true
      reject(error)
    })
    left.on('close', (code) => finish(code, fromCmd))
    right.on('close', (code) => finish(code, toCmd))
  })
}

run(async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  if (args.positionals.length) throw new Error(`unexpected argument ${args.positionals[0]}`)
  try {
    await access(paths.output)
  } catch {
    throw new Error('public/content does not exist; run process first')
  }
  // The game reads index.json, so a pack is never cut without the current one.
  if (!args.dryRun) await writeIndexFile()
  const lock = JSON.parse(await readFile(paths.lock, 'utf8'))
  const compression = !args.gzip && (await commandExists('zstd')) ? 'zstd' : 'gzip'
  const next = nextArchive(lock, compression)
  const dest = join(paths.root, next.tarball)
  if (args.dryRun) {
    log(`would pack public/content → ${next.tarball} (${compression})`)
    return
  }
  const partial = `${dest}.partial`
  if (compression === 'gzip') {
    await new Promise((resolve, reject) => {
      const child = spawn('tar', ['-C', join(paths.root, 'public'), '-czf', partial, 'content'], { stdio: 'inherit' })
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))))
    })
  } else {
    await pipe('tar', ['-C', join(paths.root, 'public'), '-cf', '-', 'content'], 'zstd', ['-q', '-f', '-o', partial])
  }
  await rename(partial, dest)
  const sha256 = await sha256File(dest)
  const written = { version: next.version, tarball: next.tarball, sha256 }
  await writeFile(paths.lock, `${JSON.stringify(written, null, 2)}\n`)
  log(`packed ${next.tarball}  ${sha256}`)
})
