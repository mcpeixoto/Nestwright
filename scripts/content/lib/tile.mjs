const RESOLUTIONS = { '1k': 1024, '2k': 2048, '4k': 4096 }

export function resolutionPixels(resolution) {
  const px = RESOLUTIONS[resolution]
  if (!px) throw new Error(`resolution must be 1k, 2k or 4k (got ${resolution})`)
  return px
}

/** Model textures stay at or under 1024 (1k) or 2048 (2k and 4k). */
export function modelTextureLimit(resolution) {
  return resolution === '1k' ? 1024 : 2048
}

/**
 * Real-world width of one texture tile, in metres.
 * Poly Haven `dimensions` are millimetres. An entry `tileMeters` is the fallback.
 */
export function resolveTileMeters({ dimensionsMm, entryTileMeters } = {}) {
  if (Array.isArray(dimensionsMm) && Number(dimensionsMm[0]) > 0) {
    return Math.round((Number(dimensionsMm[0]) / 1000) * 1e6) / 1e6
  }
  if (typeof entryTileMeters === 'number' && entryTileMeters > 0) return entryTileMeters
  return null
}

export function unitsToMetres(units) {
  if (units == null || units === 'm' || units === 'metres' || units === 'meters') return 1
  if (units === 'dm') return 0.1
  if (units === 'cm') return 0.01
  if (units === 'mm') return 0.001
  throw new Error(`unknown units ${units} (expected m, dm, cm or mm)`)
}
