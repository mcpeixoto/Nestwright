import { sunPhase } from './sunLook'

/**
 * Albedo, not the lit colour. A clear afternoon sun (no environment mirror)
 * should read near sRGB (95, 98, 102) on streets and (150, 150, 145) on sidewalks.
 */
export const STREET_ALBEDO_SRGB: readonly [number, number, number] = [92, 91, 87]
export const SIDEWALK_ALBEDO_SRGB: readonly [number, number, number] = [133, 129, 114]

/** Distant asphalt fades toward this, not the meadow green. Blue stays above green. */
export const URBAN_HAZE_SRGB: readonly [number, number, number] = [150, 162, 182]

export const ASPHALT_ROUGHNESS = 0.96
export const GROUND_ENV_INTENSITY = 0

/** Courtyard pavers. One tile is half a metre, under the 0.6 m cap. */
export const PLAZA_TILE_M = 0.5

export type FacadePattern = 'punched' | 'ribbon'

export interface FacadeLook {
  color: readonly [number, number, number]
  pattern: FacadePattern
  /** Share of windows that glow once the sun is below civil twilight. */
  glow: number
}

const PALETTE: readonly { color: readonly [number, number, number]; pattern: FacadePattern }[] = [
  { color: [232, 226, 214], pattern: 'punched' },
  { color: [214, 196, 166], pattern: 'punched' },
  { color: [176, 92, 68], pattern: 'punched' },
  { color: [198, 196, 190], pattern: 'ribbon' },
  { color: [226, 214, 196], pattern: 'ribbon' },
  { color: [186, 168, 146], pattern: 'punched' },
  { color: [118, 122, 128], pattern: 'ribbon' },
  { color: [88, 98, 112], pattern: 'ribbon' },
]

const SHELL: readonly (readonly [number, number, number])[] = [
  [236, 230, 220],
  [224, 208, 184],
  [214, 212, 206],
]

export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function hashString(text: string): number {
  let h = 2166136261
  const value = text || 'apartment'
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/**
 * City windows glow only in full night: sun below civil twilight (−6°).
 * That is `sunPhase === 'night'`. Twilight and daytime stay dark glass.
 */
export function cityWindowsGlow(altitudeRad: number): boolean {
  return sunPhase(altitudeRad) === 'night'
}

/** Stable fraction in [0.35, 0.60] for one building. */
export function windowGlowFraction(seed: number): number {
  return 0.35 + hash01(seed) * 0.25
}

/** One window cell. `cellSeed` and `buildingSeed` are stable hashes, not pixels. */
export function windowIsLit(cellSeed: number, buildingSeed: number, altitudeRad: number): boolean {
  if (!cityWindowsGlow(altitudeRad)) return false
  return hash01(cellSeed) < windowGlowFraction(buildingSeed)
}

export function facadeLook(index: number): FacadeLook {
  const i = Math.abs(Math.floor(Number.isFinite(index) ? index : 0))
  const pick = PALETTE[i % PALETTE.length] ?? PALETTE[0]!
  return { color: pick.color, pattern: pick.pattern, glow: windowGlowFraction(i + 19) }
}

/** Light render for the block under the unit. Warm white, beige, or pale grey from the project id. */
export function shellFacadeColor(projectId: string): readonly [number, number, number] {
  const index = Math.floor(hashString(projectId) * SHELL.length) % SHELL.length
  return SHELL[index] ?? SHELL[0]!
}

export function shellGlowFraction(projectId: string): number {
  return windowGlowFraction(hashString(`${projectId || 'apartment'}:glow`) * 997)
}
