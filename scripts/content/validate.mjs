#!/usr/bin/env node
/**
 * Check licences, credits, target ids and (when public/content exists) files.
 */
import { readdirSync, statSync } from 'node:fs'
import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { log, parseArgs, run, warn } from './lib/cli.mjs'
import { loadIds } from './lib/ids.mjs'
import { paths } from './lib/paths.mjs'
import { loadSources } from './lib/sources.mjs'
import { validateState } from './lib/validate.mjs'

const HELP = `node scripts/content/validate.mjs [--dry-run]

Exit 1 when a manifest or source entry has a forbidden licence, a CC-BY asset
without author and url, a target id that is not in the game, a duplicate key,
or a listed file missing from public/content (only if that folder exists).
`

async function readJsonDir(dir) {
  let names
  try {
    names = await readdir(dir)
  } catch (err) {
    if (err && err.code === 'ENOENT') return []
    throw err
  }
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      out.push(JSON.parse(await readFile(join(dir, name), 'utf8')))
    } catch (err) {
      throw new Error(`${join(dir, name)} is not valid JSON (${err instanceof Error ? err.message : err})`, { cause: err })
    }
  }
  return out
}

function outputFiles() {
  const present = new Set()
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) walk(abs)
      else present.add(abs.slice(paths.output.length + 1).split('\\').join('/'))
    }
  }
  walk(paths.output)
  return present
}

run(async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  if (args.positionals.length) throw new Error(`unexpected argument ${args.positionals[0]}`)
  const sources = await loadSources()
  const manifests = await readJsonDir(paths.manifests)
  const lock = JSON.parse(await readFile(paths.lock, 'utf8'))
  const ids = loadIds()
  let outputExists = true
  try {
    await access(paths.output)
  } catch {
    outputExists = false
  }
  const present = outputExists ? outputFiles() : new Set()
  const report = validateState({
    sources,
    manifests,
    ids,
    lock,
    outputExists,
    fileExists: (rel) => present.has(rel),
  })
  if (args.dryRun) log(`checked ${sources.length} source(s), ${manifests.length} manifest(s)`)
  if (report.length) {
    for (const error of report) warn(error)
    throw new Error(`${report.length} content error(s)`)
  }
  log(`content ok (${manifests.length} manifest(s))`)
})
