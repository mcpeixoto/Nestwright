#!/usr/bin/env node
/**
 * Download the content pack named in content/lock.json and extract it.
 * A null tarball means the game stays on procedural art.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { log, parseArgs, run, warn } from './lib/cli.mjs'
import { downloadTo } from './lib/http.mjs'
import { digestsMatch, sha256File } from './lib/hash.mjs'
import { fetchPackPlan, releaseAssetUrl } from './lib/lock.mjs'
import { paths } from './lib/paths.mjs'

const HELP = `node scripts/content/fetch-pack.mjs [--dry-run]

Download the GitHub release named in content/lock.json (tag content-vN),
verify sha256, and extract it to public/content.
When lock.tarball is null, prints "no content pack; procedural fallback" and exits 0.
`

function spawnOk(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', () => resolve({ ok: false, stdout, stderr }))
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code }))
  })
}

function pipeExtract(archive) {
  return new Promise((resolve, reject) => {
    const zstd = spawn('zstd', ['-d', '-c', archive], { stdio: ['ignore', 'pipe', 'inherit'] })
    const tar = spawn('tar', ['-C', join(paths.root, 'public'), '-xf', '-'], { stdio: ['pipe', 'inherit', 'inherit'] })
    zstd.stdout.pipe(tar.stdin)
    let failed = false
    const fail = (error) => {
      if (failed) return
      failed = true
      reject(error)
    }
    zstd.on('error', fail)
    tar.on('error', fail)
    zstd.on('close', (code) => {
      if (code !== 0) fail(new Error(`zstd exited ${code}`))
    })
    tar.on('close', (code) => {
      if (code !== 0) fail(new Error(`tar exited ${code}`))
      else if (!failed) resolve()
    })
  })
}

async function repoSlug() {
  const viewed = await spawnOk('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  if (viewed.ok && viewed.stdout.trim()) return viewed.stdout.trim()
  const remote = await spawnOk('git', ['remote', 'get-url', 'origin'])
  const text = remote.stdout.trim()
  const match = text.match(/github\.com[:/]([^/]+\/[^/.]+)/)
  if (!match) throw new Error('cannot tell which GitHub repo holds the content release')
  return match[1]
}

async function downloadAsset(plan) {
  const dir = join(tmpdir(), `nestwright-pack-${process.pid}`)
  await mkdir(dir, { recursive: true })
  const dest = join(dir, plan.file)
  const gh = await spawnOk('gh', ['release', 'download', plan.tag, '--pattern', plan.file, '--dir', dir, '--clobber'])
  if (!gh.ok) {
    const repo = await repoSlug()
    warn(`gh release download failed (${gh.stderr.trim() || gh.code}); trying HTTPS`)
    await downloadTo(releaseAssetUrl(repo, plan.file), dest)
  }
  return dest
}

run(async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  if (args.positionals.length) throw new Error(`unexpected argument ${args.positionals[0]}`)
  const lock = JSON.parse(await readFile(paths.lock, 'utf8'))
  const plan = fetchPackPlan(lock)
  if (plan.action === 'skip') {
    log(plan.message)
    return
  }
  if (args.dryRun) {
    log(`would download ${plan.file} from release ${plan.tag} and extract to public/content`)
    return
  }
  const archive = await downloadAsset(plan)
  const actual = await sha256File(archive)
  if (!digestsMatch(actual, plan.sha256)) {
    await rm(archive, { force: true })
    throw new Error(`sha256 mismatch for ${plan.file}: got ${actual}`)
  }
  await mkdir(join(paths.root, 'public'), { recursive: true })
  if (plan.file.endsWith('.tar.zst')) await pipeExtract(archive)
  else {
    const extracted = await spawnOk('tar', ['-C', join(paths.root, 'public'), '-xf', archive])
    if (!extracted.ok) throw new Error(extracted.stderr.trim() || 'tar extract failed')
  }
  await rm(archive, { force: true })
  log(`extracted ${plan.file} to public/content`)
})
