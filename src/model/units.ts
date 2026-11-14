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

const METRES_PER: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  ft: 0.3048,
  in: 0.0254,
}

const UNIT_ALIASES: Record<string, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  "'": 'ft',
  ft: 'ft',
  foot: 'ft',
  feet: 'ft',
  '"': 'in',
  in: 'in',
  inch: 'in',
  inches: 'in',
}

/** Longest metres a typed length may be: a plot is never wider than this. */
const MAX_LENGTH = 1000

const TOKEN = /^(\d+\/\d+|\d*\.?\d+(?:\s+\d+\/\d+)?)\s*(mm|cm|m|'|ft|feet|foot|"|inches|inch|in)?\s*-?\s*/

function readNumber(raw: string): number {
  const parts = raw.trim().split(/\s+/)
  let total = 0
  for (const part of parts) {
    const slash = part.indexOf('/')
    if (slash >= 0) {
      const num = Number(part.slice(0, slash))
      const den = Number(part.slice(slash + 1))
      if (!(den > 0)) return NaN
      total += num / den
    } else total += Number(part)
  }
  return total
}

export interface ParseLengthOptions {
  /** Accept 0 (positions along a wall); lengths must be positive by default. */
  allowZero?: boolean
}

/**
 * Parse a typed length into metres. Accepts `3.5`, `3,5`, `350 cm`, `1m 20cm`,
 * `11' 4"`, `11'4`, `11 ft 4 in`, `4 1/2"`. A bare number means metres in metric and
 * decimal feet in imperial; a bare number after feet means inches.
 */
export function parseLength(text: string, units: UnitSystem, options: ParseLengthOptions = {}): number | null {
  let rest = text
    .trim()
    .toLowerCase()
    .replace(/[\u2019\u2032]/g, "'")
    .replace(/[\u201d\u2033]|''/g, '"')
    .replace(/(\d),(\d)/g, '$1.$2')
  if (!rest) return null
  let total = 0
  let lastUnit: string | null = null
  let count = 0
  while (rest.length > 0) {
    const match = TOKEN.exec(rest)
    if (!match || match[0].length === 0) return null
    const value = readNumber(match[1] ?? '')
    if (!Number.isFinite(value)) return null
    let unit = match[2] ? (UNIT_ALIASES[match[2]] ?? null) : null
    if (!unit) {
      if (lastUnit === 'ft') unit = 'in'
      else if (count === 0) unit = units === 'metric' ? 'm' : 'ft'
      else return null
    }
    total += value * (METRES_PER[unit] ?? NaN)
    lastUnit = unit
    count += 1
    rest = rest.slice(match[0].length)
  }
  if (!Number.isFinite(total) || total > MAX_LENGTH) return null
  if (total < 0 || (total === 0 && !options.allowZero)) return null
  return total
}

/** `4 x 3`, `4×3`, `13' x 10'`: width then depth, in metres. */
export function parseSize(text: string, units: UnitSystem): { w: number; d: number } | null {
  const parts = text.split(/\s*[x×*]\s*/i)
  if (parts.length !== 2) return null
  const w = parseLength(parts[0] ?? '', units)
  const d = parseLength(parts[1] ?? '', units)
  if (w == null || d == null) return null
  return { w, d }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Editable text for a length field: `3.455 m`, or feet and inches to the nearest
 * eighth (`11' 4 1/2"`). `parseLength` reads it back.
 */
export function formatLengthInput(metres: number, units: UnitSystem): string {
  if (!Number.isFinite(metres)) return ''
  if (units === 'metric') return `${trim(metres, 3)} m`
  const sign = metres < 0 ? '-' : ''
  const eighths = Math.round(Math.abs(metres) * INCHES_PER_METRE * 8)
  const feet = Math.floor(eighths / 96)
  const restEighths = eighths - feet * 96
  const whole = Math.floor(restEighths / 8)
  const frac = restEighths - whole * 8
  let inches = String(whole)
  if (frac > 0) {
    const g = gcd(frac, 8)
    inches += ` ${frac / g}/${8 / g}`
  }
  return `${sign}${feet}' ${inches}"`
}
