import { solarHour, sunVector } from './sun'

/** End of civil twilight. The sun is this far below the horizon before full night. */
export const TWILIGHT_RAD = (-6 * Math.PI) / 180

export type SunPhase = 'day' | 'twilight' | 'night'

/** Day above the horizon, twilight down to −6°, night after that. */
export function sunPhase(altitude: number): SunPhase {
  const alt = Number.isFinite(altitude) ? altitude : 0
  if (alt < TWILIGHT_RAD) return 'night'
  if (alt < 0) return 'twilight'
  return 'day'
}

export interface SunLook {
  r: number
  g: number
  b: number
  /** 0 at a high sun, 1 at the horizon. Increases as the sun sets. */
  warmth: number
  /** Directional sun intensity. Falls as altitude falls. */
  intensity: number
  moon: number
  exposure: number
  /** 0 at night, 1 in full daylight. */
  daylight: number
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Colour and brightness of the sun from its altitude in radians.
 * Warmth and intensity are monotonic through dusk: lower altitude is warmer and dimmer
 * from just above the horizon up to about half a radian.
 */
export function sunLook(altitude: number): SunLook {
  const alt = Number.isFinite(altitude) ? altitude : 0.4
  // Daylight stays partly up through civil twilight so blue hour is not pitch black.
  const daylight = smooth(TWILIGHT_RAD - 0.08, 0.32, alt)
  const warmth = 1 - smooth(0, 0.5, Math.max(0, alt))
  // Stay bright while the sun is up (a 5° sun is still afternoon) and fade
  // through civil twilight. Full sun by ~16°, off once the sun is ~8° down.
  const above = smooth(-0.14, 0.04, alt)
  const climb = smooth(0, 0.28, Math.max(0, alt))
  const intensity = (0.9 + climb * 1.6) * above
  const r = 1
  const g = 0.22 + (1 - warmth) * 0.7
  const b = 0.12 + (1 - warmth) * 0.7
  const exposure = 0.42 + daylight * 0.63
  const moon = (1 - daylight) * 0.75
  return { r, g, b, warmth, intensity, moon, exposure, daylight }
}

/**
 * Sun direction with the project's north bearing applied. `north` is radians, clockwise from plan +y.
 * `hour` is local civil time, converted to solar time for the latitude's preset site.
 */
export function sunDirection(
  dayOfYear: number,
  hour: number,
  latitudeDeg: number,
  north: number,
): { x: number; y: number; z: number } {
  const v = sunVector(dayOfYear, solarHour(dayOfYear, hour, latitudeDeg), latitudeDeg)
  const c = Math.cos(north)
  const s = Math.sin(north)
  const x = v.x * c + v.z * s
  const y = v.y
  const z = -v.x * s + v.z * c
  const length = Math.hypot(x, y, z) || 1
  return { x: x / length, y: y / length, z: z / length }
}
