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
  /** 0 with the sun at or below the horizon, 1 once it is fully up (~16°). */
  climb: number
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

/** Directional sun intensity with the sun on the horizon. */
export const SUN_HORIZON_INTENSITY = 0.9
/**
 * Directional sun intensity once the sun is fully up (~16°). Against a daytime fill of
 * hemisphere 0.3 + environment ENV_INTENSITY this puts the sky at ~20 % of the light on open
 * ground at noon, as on a clear day; at 2.5 with a 0.8 hemisphere the fill was ~60 % and the
 * whole scene read flat and hazy.
 */
export const SUN_PEAK_INTENSITY = 4.5
/** Look exposure with the sun down, and what daylight adds by the end of civil twilight. */
export const NIGHT_EXPOSURE = 0.42
export const DAYLIGHT_EXPOSURE = 0.63
/**
 * Look exposure taken off as the sun climbs from the horizon to ~16°. It offsets the stronger
 * peak sun so sunlit surfaces land on their albedo comments (roof, lawn): the noon base is
 * 1.05 − 0.6 = 0.45, just above the 0.42 of night. Dusk and night, with the sun at or below
 * the horizon, keep the exposure they had (see tests/view3d/litColour.test.ts).
 */
export const CLIMB_EXPOSURE_DROP = 0.6

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
  const intensity = (SUN_HORIZON_INTENSITY + climb * (SUN_PEAK_INTENSITY - SUN_HORIZON_INTENSITY)) * above
  const r = 1
  const g = 0.22 + (1 - warmth) * 0.7
  const b = 0.12 + (1 - warmth) * 0.7
  const exposure = NIGHT_EXPOSURE + daylight * DAYLIGHT_EXPOSURE - climb * CLIMB_EXPOSURE_DROP
  const moon = (1 - daylight) * 0.75
  return { r, g, b, warmth, intensity, moon, exposure, daylight, climb }
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
