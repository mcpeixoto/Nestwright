export type UnitSystem = 'metric' | 'imperial'

const INCHES_PER_METRE = 39.37007874015748
const SQ_FEET_PER_SQ_METRE = 10.763910416709722

function trim(n: number, digits: number): string {
  const fixed = n.toFixed(digits)
  return fixed.replace(/\.?0+$/, '')
}

/** `3.45 m` or `11' 4"`. */
export function formatLength(metres: number, units: UnitSystem): string {
  if (!Number.isFinite(metres)) return units === 'metric' ? '— m' : '—'
  if (units === 'metric') return `${trim(metres, 2)} m`
  const sign = metres < 0 ? '-' : ''
  let inches = Math.round(Math.abs(metres) * INCHES_PER_METRE)
  const feet = Math.floor(inches / 12)
  inches -= feet * 12
  return `${sign}${feet}' ${inches}"`
}

/** `12.3 m²` or `132 ft²`. */
export function formatArea(squareMetres: number, units: UnitSystem): string {
  if (!Number.isFinite(squareMetres)) return units === 'metric' ? '— m²' : '—'
  if (units === 'metric') return `${trim(squareMetres, 1)} m²`
  const feet = Math.round(squareMetres * SQ_FEET_PER_SQ_METRE)
  return `${feet} ft²`
}

/** Parse a typed length. Metric is metres; imperial is decimal feet. */
export function parseLength(text: string, units: UnitSystem): number | null {
  const n = Number(text.trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return units === 'metric' ? n : n * 0.3048
}
