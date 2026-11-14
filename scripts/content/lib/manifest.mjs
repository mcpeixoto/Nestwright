import { reviewLicence } from './licence.mjs'

const KINDS = new Set(['texture', 'model', 'hdri'])

function isSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

/** Structural problems with one content manifest. Empty array means it is usable. */
export function manifestErrors(manifest) {
  const errors = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest is not an object']
  const where = typeof manifest.key === 'string' ? manifest.key : '(no key)'
  for (const field of ['key', 'kind', 'provider', 'sourceId', 'sourceUrl', 'author', 'licence', 'fetchedAt', 'sha256Source', 'files', 'targets']) {
    if (manifest[field] == null) errors.push(`${where} missing ${field}`)
  }
  if (manifest.kind != null && !KINDS.has(manifest.kind)) errors.push(`${where} kind is not texture, model or hdri`)
  if (manifest.licence != null) {
    const review = reviewLicence(manifest.licence)
    if (!review.allowed) errors.push(`${where} licence ${manifest.licence} is not allowed`)
    if (review.banned.length) errors.push(`${where} licence contains ${review.banned.join(', ')}`)
  }
  if (manifest.licence === 'CC-BY-4.0' && (!manifest.author || !(manifest.sourceUrl || manifest.url))) {
    errors.push(`${where} CC-BY-4.0 needs author and url`)
  }
  if (manifest.sha256Source != null && !isSha(manifest.sha256Source)) errors.push(`${where} sha256Source is not a sha256`)
  if (manifest.fetchedAt != null && Number.isNaN(Date.parse(manifest.fetchedAt))) errors.push(`${where} fetchedAt is not a date`)
  if (manifest.files != null && !Array.isArray(manifest.files)) errors.push(`${where} files is not an array`)
  if (Array.isArray(manifest.files)) {
    for (const file of manifest.files) {
      if (!file || typeof file.path !== 'string' || file.path.includes('..')) errors.push(`${where} file path is missing`)
      else if (typeof file.bytes !== 'number' || file.bytes < 0) errors.push(`${where} ${file.path} bytes is missing`)
      else if (!isSha(file.sha256)) errors.push(`${where} ${file.path} sha256 is missing`)
    }
  }
  if (manifest.kind === 'texture') {
    const mean = manifest.texture?.meanAlbedoSrgb
    if (!Array.isArray(mean) || mean.length !== 3 || mean.some((channel) => typeof channel !== 'number')) {
      errors.push(`${where} texture.meanAlbedoSrgb must be [r, g, b]`)
    }
    if (typeof manifest.texture?.tileMeters !== 'number' || manifest.texture.tileMeters <= 0) {
      errors.push(`${where} texture.tileMeters must be metres`)
    }
  }
  if (manifest.kind === 'model') {
    const bounds = manifest.model?.bounds
    if (!bounds || ['w', 'd', 'h'].some((axis) => typeof bounds[axis] !== 'number')) errors.push(`${where} model.bounds must be {w, d, h}`)
    if (typeof manifest.model?.triangles !== 'number') errors.push(`${where} model.triangles is missing`)
    if (!Array.isArray(manifest.model?.lods)) errors.push(`${where} model.lods is missing`)
    if (!Array.isArray(manifest.model?.materials)) errors.push(`${where} model.materials is missing`)
  }
  return errors
}

export function renderAssetsDoc(existing, manifests) {
  const marker = '| asset | source URL | author | licence | date fetched | sha256 | processed files |'
  const index = existing.indexOf(marker)
  if (index < 0) throw new Error('docs/ASSETS.md is missing the asset table header')
  const divider = '| --- | --- | --- | --- | --- | --- | --- |'
  const headerEnd = existing.indexOf(divider, index)
  if (headerEnd < 0) throw new Error('docs/ASSETS.md is missing the asset table divider')
  const header = existing.slice(0, headerEnd + divider.length)
  const sorted = [...manifests].sort((a, b) => a.key.localeCompare(b.key))
  if (sorted.length === 0) return `${header}\n\nNo third-party assets yet.\n`
  const rows = sorted.map((manifest) => {
    const files = (manifest.files ?? []).map((file) => file.path).join(', ')
    const date = String(manifest.fetchedAt ?? '').slice(0, 10)
    const cells = [manifest.key, manifest.sourceUrl, manifest.author, manifest.licence, date, manifest.sha256Source, files]
    return `| ${cells.map((cell) => String(cell ?? '').replaceAll('|', '/')).join(' | ')} |`
  })
  return `${header}\n${rows.join('\n')}\n`
}
