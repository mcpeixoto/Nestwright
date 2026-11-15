import { reviewLicence } from './licence.mjs'

const ROLE_RULES = [
  { role: 'normal', test: (name) => name.includes('normalgl') || name.includes('normal_gl') || name.includes('nor_gl') },
  { role: null, test: (name) => name.includes('normaldx') || name.includes('normal_dx') || name.includes('nor_dx') },
  { role: 'albedo', test: (name) => name.includes('color') || name.includes('albedo') || name.includes('basecolor') || name.includes('diffuse') },
  { role: 'roughness', test: (name) => name.includes('roughness') || name.includes('rough') },
  { role: 'metalness', test: (name) => name.includes('metalness') || name.includes('metallic') },
  { role: 'ao', test: (name) => name.includes('ambientocclusion') || name.includes('ambient_occlusion') || /(?:^|_)ao(?:[._]|$)/.test(name) },
  { role: 'displacement', test: (name) => name.includes('displacement') || name.includes('height') },
]

/** Map a zip entry or cache filename onto a texture role. DirectX normals are ignored. */
export function ambientMapRole(filename) {
  const base = String(filename).split(/[\\/]/).pop().toLowerCase()
  if (base.startsWith('albedo.') || base === 'albedo') return 'albedo'
  if (base.startsWith('normal.') || base === 'normal') return 'normal'
  if (base.startsWith('roughness.') || base === 'roughness') return 'roughness'
  if (base.startsWith('metalness.') || base === 'metalness') return 'metalness'
  if (base.startsWith('ao.') || base === 'ao') return 'ao'
  if (base.startsWith('displacement.') || base === 'displacement') return 'displacement'
  for (const rule of ROLE_RULES) {
    if (rule.test(base)) return rule.role
  }
  return null
}

export function ambientAttribute(resolution) {
  return `${resolution.toUpperCase()}-JPG`
}

export function pickAmbientDownload(json, resolution) {
  const asset = json?.foundAssets?.[0]
  if (!asset) throw new Error('ambientCG response has no foundAssets')
  const downloads = asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? []
  const want = ambientAttribute(resolution)
  const hit = downloads.find((item) => String(item?.attribute ?? '').toUpperCase() === want)
  if (!hit) throw new Error(`ambientCG asset has no ${want} zip`)
  const url = hit.downloadLink || hit.fullDownloadPath
  if (!url) throw new Error(`ambientCG ${want} zip has no download link`)
  return { url, size: hit.size ?? null, fileName: hit.fileName || `${want}.zip`, asset }
}

export function assertAmbientCc0(asset) {
  const declared = asset?.licence ?? asset?.license
  if (declared == null) return
  const review = reviewLicence(typeof declared === 'string' ? declared : JSON.stringify(declared))
  if (!review.allowed || review.normalised !== 'CC0') {
    throw new Error(`ambientCG asset is not CC0 (${declared})`)
  }
}

/**
 * ambientCG `dimensionX` is centimetres (Concrete034 is 110, Tiles107 is 100). Reading it as
 * metres-or-millimetres made 15 sets 10× too small or 100× too large.
 */
export function ambientSpanToMetres(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round((n / 100) * 1e6) / 1e6
}
