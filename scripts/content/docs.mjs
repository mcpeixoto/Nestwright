#!/usr/bin/env node
/**
 * Regenerate the asset table in docs/ASSETS.md from content/manifest.
 * The policy paragraphs above the table are kept.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { log, parseArgs, run } from './lib/cli.mjs'
import { renderAssetsDoc } from './lib/manifest.mjs'
import { paths } from './lib/paths.mjs'

const HELP = `node scripts/content/docs.mjs [--dry-run]

Rewrite the table in docs/ASSETS.md from content/manifest/*.json.
--dry-run prints the document and does not write it.
`

run(async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  if (args.positionals.length) throw new Error(`unexpected argument ${args.positionals[0]}`)
  const existing = await readFile(paths.assetsDoc, 'utf8')
  let names = []
  try {
    names = (await readdir(paths.manifests)).filter((name) => name.endsWith('.json'))
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err
  }
  const manifests = []
  for (const name of names.sort()) manifests.push(JSON.parse(await readFile(join(paths.manifests, name), 'utf8')))
  const next = renderAssetsDoc(existing, manifests)
  if (args.dryRun) {
    process.stdout.write(next)
    return
  }
  await writeFile(paths.assetsDoc, next)
  log(`wrote ${paths.assetsDoc} (${manifests.length} asset(s))`)
})
