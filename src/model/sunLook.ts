import { sunVector } from './sun'

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
  const daylight = smooth(-0.1, 0.28, alt)
  const warmth = 1 - smooth(0, 0.5, Math.max(0, alt))
  const above = smooth(-0.04, 0.14, alt)
  const intensity = (0.12 + smooth(0, 0.55, alt) * 2.63) * above
  const r = 1
  const g = 0.22 + (1 - warmth) * 0.7
  const b = 0.12 + (1 - warmth) * 0.7
  const exposure = 0.42 + daylight * 0.14
  const moon = (1 - daylight) * 0.42
  return { r, g, b, warmth, intensity, moon, exposure, daylight }
}

/** Sun direction with the project's north bearing applied. `north` is radians, clockwise from plan +y. */
export function sunDirection(
  dayOfYear: number,
  hour: number,
  latitudeDeg: number,
  north: number,
): { x: number; y: number; z: number } {
  const v = sunVector(dayOfYear, hour, latitudeDeg)
  const c = Math.cos(north)
  const s = Math.sin(north)
  const x = v.x * c + v.z * s
  const y = v.y
  const z = -v.x * s + v.z * c
  const length = Math.hypot(x, y, z) || 1
  return { x: x / length, y: y / length, z: z / length }
}
