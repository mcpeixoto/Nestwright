#!/usr/bin/env node
/**
 * Turn content/cache into public/content and content/manifest/<key>.json.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { log, parseArgs, run } from './lib/cli.mjs'
import { loadIds, materialTileSize } from './lib/ids.mjs'
import { manifestErrors } from './lib/manifest.mjs'
import { processModel } from './lib/model.mjs'
import { outputRecord } from './lib/output.mjs'
import { cacheDir, paths } from './lib/paths.mjs'
import { loadSources, selectEntries } from './lib/sources.mjs'
import { processTexture } from './lib/textures.mjs'
import { unitsToMetres } from './lib/tile.mjs'

const HELP = `node scripts/content/process.mjs [--only key,key] [--dry-run] [--webp]

Encode cached downloads into public/content and write content/manifest/<key>.json.
--webp keeps model textures as WebP when KTX-Software is not available.
Texture sets (albedo, normal, ORM) are always KTX2.
`

function roundMetres(box) {
  const round = (value) => Math.round(value * 1e6) / 1e6
  return { w: round(box.w), d: round(box.d), h: round(box.h) }
}

function tileFor(entry, meta, library) {
  if (typeof meta.tileMeters === 'number' && meta.tileMeters > 0) return meta.tileMeters
  if (typeof entry.tileMeters === 'number' && entry.tileMeters > 0) return entry.tileMeters
  if (entry.targets?.materialId) return materialTileSize(library, entry.targets.materialId)
  return null
}

async function loadMeta(entry) {
  const dir = cacheDir(entry)
  let meta
  try {
    meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
  } catch (err) {
    throw new Error(`${entry.key}: no cache meta at ${join(dir, 'meta.json')} (${err instanceof Error ? err.message : err})`, { cause: err })
  }
  meta.files = (meta.files ?? []).map((file) => ({ ...file, abs: join(dir, file.name) }))
  return meta
}

function shell(entry, meta) {
  return {
    key: entry.key,
    kind: entry.kind,
    provider: entry.provider,
    sourceId: entry.sourceId,
    sourceUrl: meta.sourceUrl,
    author: meta.author ?? '',
    licence: entry.licence,
    fetchedAt: meta.fetchedAt,
    sha256Source: meta.sha256Source,
    targets: entry.targets ?? {},
    files: [],
  }
}

async function writeManifest(manifest) {
  const errors = manifestErrors(manifest)
  if (errors.length) throw new Error(errors.join('\n'))
  await mkdir(paths.manifests, { recursive: true })
  await writeFile(join(paths.manifests, `${manifest.key}.json`), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function processOne(entry, { webp, library }) {
  const meta = await loadMeta(entry)
  const manifest = shell(entry, meta)
  if (entry.kind === 'texture') {
    const tileMeters = tileFor(entry, meta, library)
    if (!tileMeters) throw new Error(`${entry.key}: tileMeters unknown; set tileMeters on the source entry`)
    const dest = join(paths.output, 'textures', entry.key)
    const stats = await processTexture(meta, dest)
    const names = ['albedo.ktx2', 'orm.ktx2']
    if (meta.files.some((file) => file.role === 'normal')) names.splice(1, 0, 'normal.ktx2')
    for (const name of names) manifest.files.push(await outputRecord(join(dest, name)))
    manifest.texture = { meanAlbedoSrgb: stats.meanAlbedoSrgb, tileMeters }
  } else if (entry.kind === 'model') {
    if (!meta.modelFile) throw new Error(`${entry.key}: cache meta has no modelFile`)
    const dest = join(paths.output, 'models', entry.key)
    const result = await processModel(join(cacheDir(entry), meta.modelFile), {
      key: entry.key,
      outDir: dest,
      scale: unitsToMetres(entry.units),
      resolution: entry.resolution,
      webp,
    })
    for (const file of result.files) manifest.files.push(await outputRecord(file))
    manifest.model = {
      bounds: roundMetres(result.bounds),
      originalBounds: roundMetres(result.originalBounds),
      triangles: result.triangles,
      lods: [
        { file: `${entry.key}.glb`, triangles: result.triangles },
        { file: `${entry.key}.lod1.glb`, triangles: result.lodTriangles, ratio: 0.35, error: 0.01 },
      ],
      materials: result.materials,
    }
  } else if (entry.kind === 'hdri') {
    const hdr = meta.files.find((file) => file.name.toLowerCase().endsWith('.hdr'))
    if (!hdr) throw new Error(`${entry.key}: cache has no .hdr`)
    const dest = join(paths.output, 'hdri', `${entry.key}.hdr`)
    await mkdir(dirname(dest), { recursive: true })
    await copyFile(hdr.abs, dest)
    manifest.files.push(await outputRecord(dest))
  } else {
    throw new Error(`${entry.key}: unsupported kind ${entry.kind}`)
  }
  await writeManifest(manifest)
  log(`processed ${entry.key}`)
}

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
  const { library } = loadIds()
  for (const entry of entries) {
    if (args.dryRun) {
      const suffix = entry.kind === 'model' && args.webp ? ' (webp)' : ''
      log(`would process ${entry.key} (${entry.kind})${suffix}`)
      continue
    }
    await processOne(entry, { webp: args.webp, library })
  }
})
