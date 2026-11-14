import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { ambientMapRole, assertAmbientCc0, ambientSpanToMetres, pickAmbientDownload } from './ambientcg.mjs'
import { cacheDir } from './paths.mjs'
import { sourceDigest, sha256Buffer } from './hash.mjs'
import { downloadTo, fetchJson } from './http.mjs'
import { assertPolyhavenCc0, formatAuthors, pickPolyhaven, polyhavenPage, polyhavenTileMeters } from './polyhaven.mjs'
import { unzipFile } from './unzip.mjs'

function fileNameFromUrl(url) {
  const name = decodeURIComponent(new globalThis.URL(url).pathname.split('/').pop() || '')
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) throw new Error(`unsafe download name ${url}`)
  return name
}

async function walk(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err && err.code === 'ENOENT') return out
    throw err
  }
  for (const entry of entries) {
    if (entry.name === 'meta.json' || entry.name.endsWith('.partial')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}

function recordFile(name, bytes, sha256, role) {
  return { name, bytes, sha256, role: role ?? null }
}

async function hashFile(dir, name, role) {
  const data = await readFile(join(dir, name))
  return recordFile(name, data.length, sha256Buffer(data), role)
}

async function writeMeta(dir, meta) {
  await mkdir(dir, { recursive: true })
  const digest = sourceDigest(meta.files)
  const body = { ...meta, sha256Source: digest }
  await writeFile(join(dir, 'meta.json'), `${JSON.stringify(body, null, 2)}\n`)
  return body
}

function httpOptions(options, expectedSize) {
  return {
    fetchImpl: options.fetchImpl,
    tries: options.tries,
    sleep: options.sleep,
    expectedSize,
  }
}

async function downloadRole(dir, role, file, options) {
  const name = `${role}.${file.ext}`
  const saved = await downloadTo(file.url, join(dir, name), httpOptions(options, file.size))
  return recordFile(name, saved.bytes, saved.sha256, role)
}

export async function fetchEntry(entry, options = {}) {
  const dir = cacheDir(entry)
  await mkdir(dir, { recursive: true })
  if (entry.provider === 'polyhaven') return fetchPolyhaven(entry, dir, options)
  if (entry.provider === 'ambientcg') return fetchAmbient(entry, dir, options)
  if (entry.provider === 'sketchfab' || entry.provider === 'local') return fetchManual(entry, dir)
  throw new Error(`${entry.key}: unsupported provider ${entry.provider}`)
}

async function fetchPolyhaven(entry, dir, options) {
  const info = await fetchJson(`https://api.polyhaven.com/info/${encodeURIComponent(entry.sourceId)}`, options)
  assertPolyhavenCc0(info)
  const files = await fetchJson(`https://api.polyhaven.com/files/${encodeURIComponent(entry.sourceId)}`, options)
  const picked = pickPolyhaven(files, entry)
  const saved = []
  if (entry.kind === 'texture') {
    for (const [role, file] of Object.entries(picked.maps)) saved.push(await downloadRole(dir, role, file, options))
  } else if (entry.kind === 'model') {
    const gltfName = fileNameFromUrl(picked.gltf.url)
    const gltf = await downloadTo(picked.gltf.url, join(dir, gltfName), httpOptions(options, picked.gltf.size))
    saved.push(recordFile(gltfName, gltf.bytes, gltf.sha256, 'model'))
    for (const include of picked.include) {
      const dest = join(dir, include.path)
      const file = await downloadTo(include.url, dest, httpOptions(options, include.size))
      saved.push(recordFile(include.path, file.bytes, file.sha256, null))
    }
  } else if (entry.kind === 'hdri') {
    const file = await downloadTo(picked.hdr.url, join(dir, 'environment.hdr'), httpOptions(options, picked.hdr.size))
    saved.push(recordFile('environment.hdr', file.bytes, file.sha256, 'hdri'))
  }
  return writeMeta(dir, baseMeta(entry, {
    author: entry.author || formatAuthors(info.authors),
    sourceUrl: entry.url || polyhavenPage(entry.sourceId),
    tileMeters: polyhavenTileMeters(info, entry.tileMeters),
    modelFile: entry.kind === 'model' ? saved[0].name : undefined,
    files: saved,
  }))
}

async function fetchAmbient(entry, dir, options) {
  if (entry.kind !== 'texture') throw new Error(`${entry.key}: ambientCG fetch supports textures; place models in the cache manually`)
  const json = await fetchJson(
    `https://ambientcg.com/api/v2/full_json?id=${encodeURIComponent(entry.sourceId)}&include=downloadData`,
    options,
  )
  const picked = pickAmbientDownload(json, entry.resolution)
  assertAmbientCc0(picked.asset)
  const zipPath = join(dir, 'download.zip')
  const unpacked = join(dir, 'unpacked')
  await downloadTo(picked.url, zipPath, httpOptions(options, picked.size))
  await mkdir(unpacked, { recursive: true })
  await unzipFile(zipPath, unpacked)
  const extracted = await walk(unpacked)
  const chosen = new Map()
  for (const file of extracted) {
    const role = ambientMapRole(file)
    if (!role) continue
    const previous = chosen.get(role)
    if (!previous || /normalgl|nor_gl/.test(file.toLowerCase())) chosen.set(role, file)
  }
  if (!chosen.has('albedo')) throw new Error(`${entry.key}: ambientCG zip has no Color map`)
  const saved = []
  for (const [role, file] of chosen) {
    const ext = extname(file).slice(1).toLowerCase() || 'jpg'
    const name = `${role}.${ext}`
    const data = await readFile(file)
    await writeFile(join(dir, name), data)
    saved.push(recordFile(name, data.length, sha256Buffer(data), role))
  }
  await rm(zipPath, { force: true })
  await rm(unpacked, { recursive: true, force: true })
  const tile = ambientSpanToMetres(picked.asset.dimensionX) ?? entry.tileMeters ?? null
  return writeMeta(dir, baseMeta(entry, {
    author: entry.author || 'ambientCG',
    sourceUrl: entry.url || picked.asset.shortLink || `https://ambientcg.com/view?id=${entry.sourceId}`,
    tileMeters: tile,
    files: saved,
  }))
}

async function fetchManual(entry, dir) {
  const found = await walk(dir)
  if (found.length === 0) {
    throw new Error(`${entry.key}: no files in ${dir}. Place the ${entry.provider} download there (author, url and licence are already required on the entry).`)
  }
  const saved = []
  let modelFile
  for (const file of found) {
    const name = relative(dir, file).split('\\').join('/')
    const role = entry.kind === 'texture' ? ambientMapRole(name) : null
    if (entry.kind === 'model' && /\.(gltf|glb)$/i.test(name)) modelFile ??= name
    if (entry.kind === 'hdri' && !name.toLowerCase().endsWith('.hdr') && !name.toLowerCase().endsWith('.exr')) continue
    saved.push(await hashFile(dir, name, role))
  }
  if (entry.kind === 'texture' && !saved.some((file) => file.role === 'albedo')) {
    throw new Error(`${entry.key}: cache needs an albedo or Color image`)
  }
  if (entry.kind === 'model' && !modelFile) throw new Error(`${entry.key}: cache needs a .gltf or .glb`)
  if (entry.kind === 'hdri' && !saved.some((file) => file.name.toLowerCase().endsWith('.hdr'))) {
    throw new Error(`${entry.key}: cache needs a .hdr`)
  }
  return writeMeta(dir, baseMeta(entry, {
    author: entry.author,
    sourceUrl: entry.url,
    tileMeters: entry.tileMeters ?? null,
    modelFile,
    files: saved,
  }))
}

function baseMeta(entry, extra) {
  return {
    key: entry.key,
    kind: entry.kind,
    provider: entry.provider,
    sourceId: entry.sourceId,
    resolution: entry.resolution,
    licence: entry.licence,
    author: extra.author || '',
    sourceUrl: extra.sourceUrl,
    fetchedAt: new Date().toISOString(),
    tileMeters: extra.tileMeters ?? null,
    modelFile: extra.modelFile,
    files: extra.files,
  }
}

export function describeFetch(entry) {
  return `${entry.key}  ${entry.provider} ${entry.kind} ${entry.sourceId} @ ${entry.resolution}  → ${cacheDir(entry)}`
}
