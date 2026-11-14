import { reviewLicence } from './licence.mjs'
import { resolveTileMeters } from './tile.mjs'

const TEXTURE_KEYS = {
  albedo: ['Diffuse', 'diffuse', 'albedo'],
  normal: ['nor_gl', 'NormalGL'],
  roughness: ['Rough', 'roughness', 'Roughness'],
  metalness: ['Metal', 'metalness', 'Metalness'],
  ao: ['AO', 'ao'],
  displacement: ['Displacement', 'disp'],
}

function pickFile(node, resolution) {
  const bucket = node?.[resolution]
  if (!bucket || typeof bucket !== 'object') return null
  if (bucket.jpg?.url) return { url: bucket.jpg.url, size: bucket.jpg.size ?? null, ext: 'jpg' }
  if (bucket.png?.url) return { url: bucket.png.url, size: bucket.png.size ?? null, ext: 'png' }
  if (bucket.hdr?.url) return { url: bucket.hdr.url, size: bucket.hdr.size ?? null, ext: 'hdr' }
  return null
}

function firstMap(files, keys, resolution) {
  for (const key of keys) {
    if (!files[key]) continue
    const file = pickFile(files[key], resolution)
    if (file) return file
  }
  return null
}

/**
 * Choose downloadable files from a Poly Haven `/files/<id>` payload.
 * Textures prefer jpg over png and OpenGL normals over DirectX.
 * @returns {object}
 */
export function pickPolyhaven(files, { kind, resolution }) {
  if (!files || typeof files !== 'object') throw new Error('Poly Haven /files payload is empty')
  if (kind === 'texture') {
    const maps = {}
    for (const [role, keys] of Object.entries(TEXTURE_KEYS)) {
      const file = firstMap(files, keys, resolution)
      if (file) maps[role] = file
    }
    if (!maps.albedo) throw new Error(`Poly Haven texture has no Diffuse/albedo at ${resolution}`)
    return { kind, maps }
  }
  if (kind === 'model') {
    const slot = files.gltf?.[resolution]?.gltf
    if (!slot?.url) throw new Error(`Poly Haven model has no gltf at ${resolution}`)
    const include = Object.entries(slot.include ?? {}).map(([path, info]) => {
      if (!info?.url) throw new Error(`Poly Haven gltf include ${path} has no url`)
      if (path.includes('..') || path.startsWith('/')) throw new Error(`unsafe gltf include path ${path}`)
      return { path, url: info.url, size: info.size ?? null }
    })
    return { kind, gltf: { url: slot.url, size: slot.size ?? null }, include }
  }
  if (kind === 'hdri') {
    const hdr = files.hdri?.[resolution]?.hdr
    if (!hdr?.url) throw new Error(`Poly Haven HDRI has no hdr at ${resolution}`)
    return { kind, hdr: { url: hdr.url, size: hdr.size ?? null } }
  }
  throw new Error(`Poly Haven picker does not support kind ${kind}`)
}

export function formatAuthors(authors) {
  if (!authors) return ''
  if (typeof authors === 'string') return authors
  if (Array.isArray(authors)) return authors.filter(Boolean).join(', ')
  return Object.keys(authors).join(', ')
}

/** Poly Haven publishes CC0. Reject an info payload that says otherwise. */
export function assertPolyhavenCc0(info) {
  const declared = info?.license ?? info?.licence ?? 'CC0'
  const text = typeof declared === 'string' ? declared : JSON.stringify(declared)
  const review = reviewLicence(text)
  if (!review.allowed || review.normalised !== 'CC0') {
    throw new Error(`Poly Haven asset is not CC0 (${text})`)
  }
}

export function polyhavenPage(sourceId) {
  return `https://polyhaven.com/a/${sourceId}`
}

export function polyhavenTileMeters(info, entryTileMeters) {
  return resolveTileMeters({ dimensionsMm: info?.dimensions, entryTileMeters })
}
