#!/usr/bin/env node
/**
 * Download wish-list entries into content/cache.
 * Poly Haven and ambientCG use their public APIs. Sketchfab and local entries
 * are files you place in the cache yourself.
 */
import process from 'node:process'
import { log, parseArgs, run } from './lib/cli.mjs'
import { describeFetch, fetchEntry } from './lib/fetch-entry.mjs'
import { loadSources, selectEntries } from './lib/sources.mjs'

const HELP = `node scripts/content/fetch.mjs [--only key,key] [--dry-run]

Download content/sources.json into content/cache/<provider>/<sourceId>/<resolution>/.
Sends User-Agent: Nestwright-content-pipeline/1.0. Retries each request 3 times.
`

run(async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  if (args.positionals.length) throw new Error(`unexpected argument ${args.positionals[0]}`)
  const entries = selectEntries(await loadSources(), args.only)
  if (entries.length === 0) {
    log('no source entries')
    return
  }
  for (const entry of entries) {
    if (args.dryRun) {
      log(`would fetch ${describeFetch(entry)}`)
      continue
    }
    const meta = await fetchEntry(entry)
    log(`fetched ${entry.key}  ${meta.files.length} file(s)  ${meta.sha256Source}`)
  }
})
