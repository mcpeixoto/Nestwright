import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { paths } from './paths.mjs'

export const INDEX_VERSION = 1

/**
 * The runtime's view of the pack: material id → map paths and the stats it needs to
 * normalise them. It lives inside public/content so a pack and its index always agree.
 */
export function buildContentIndex(manifests) {
  const textures = {}
  const sorted = [...manifests].sort((a, b) => String(a.key).localeCompare(String(b.key)))
  for (const manifest of sorted) {
    if (manifest.kind !== 'texture') continue
    const materialId = manifest.targets?.materialId
    if (!materialId || textures[materialId]) continue
    const maps = {}
    for (const file of manifest.files ?? []) {
      const role = /\/(albedo|normal|orm)\.ktx2$/.exec(file.path)?.[1]
      if (role) maps[role] = file.path
    }
    if (!maps.albedo) continue
    textures[materialId] = {
      key: manifest.key,
      tileMeters: manifest.texture.tileMeters,
      meanAlbedoSrgb: manifest.texture.meanAlbedoSrgb,
      ...(manifest.texture.meanOrm ? { meanOrm: manifest.texture.meanOrm } : {}),
      ...(manifest.texture.normalScale ? { normalScale: manifest.texture.normalScale } : {}),
      maps,
    }
  }
  return { version: INDEX_VERSION, textures, models: modelEntries(sorted), credits: creditEntries(sorted) }
}

/** catalog id → the model's files and natural size. Scatter-species models are not listed yet. */
function modelEntries(sorted) {
  const models = {}
  for (const manifest of sorted) {
    if (manifest.kind !== 'model') continue
    const catalogId = manifest.targets?.catalogId
    if (!catalogId || models[catalogId]) continue
    const files = (manifest.files ?? []).map((file) => file.path)
    const lod0 = files.find((path) => path.endsWith('.glb') && !/\.lod\d+\.glb$/.test(path))
    if (!lod0) continue
    const lod1 = files.find((path) => path.endsWith('.lod1.glb'))
    models[catalogId] = {
      key: manifest.key,
      lod0,
      ...(lod1 ? { lod1 } : {}),
      ...(manifest.model?.bounds ? { bounds: manifest.model.bounds } : {}),
      ...(manifest.model?.triangles ? { triangles: manifest.model.triangles } : {}),
    }
  }
  return models
}

function titleOf(sourceId) {
  const words = String(sourceId ?? '').replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

/** One line per third-party asset for the in-game Credits screen, CC0 included. */
function creditEntries(sorted) {
  const credits = []
  for (const manifest of sorted) {
    if (manifest.kind !== 'texture' && manifest.kind !== 'model') continue
    credits.push({
      key: manifest.key,
      kind: manifest.kind,
      name: titleOf(manifest.sourceId) || manifest.key,
      author: manifest.author ?? '',
      licence: manifest.licence ?? '',
      sourceUrl: manifest.sourceUrl ?? '',
    })
  }
  return credits
}

/** Rewrite public/content/index.json from content/manifest. No-op when public/content is absent. */
export async function writeIndexFile() {
  try {
    await access(paths.output)
  } catch {
    return null
  }
  const names = (await readdir(paths.manifests)).filter((name) => name.endsWith('.json')).sort()
  const manifests = []
  for (const name of names) manifests.push(JSON.parse(await readFile(join(paths.manifests, name), 'utf8')))
  const index = buildContentIndex(manifests)
  const dest = join(paths.output, 'index.json')
  await writeFile(dest, `${JSON.stringify(index, null, 2)}\n`)
  return dest
}
