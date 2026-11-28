export interface Point3 {
  x: number
  y: number
  z: number
}

export interface Bounds3 {
  min: Point3
  max: Point3
}

function clamp(value: number, lo: number, hi: number): number {
  if (!(hi >= lo)) return value
  return Math.min(hi, Math.max(lo, value))
}

/** Keeps an orbit target over the house: x/z within the bounds plus `margin`, y within the bounds. */
export function clampOrbitTarget(target: Point3, bounds: Bounds3, margin = 3): Point3 {
  return {
    x: clamp(target.x, bounds.min.x - margin, bounds.max.x + margin),
    y: clamp(target.y, bounds.min.y, bounds.max.y),
    z: clamp(target.z, bounds.min.z - margin, bounds.max.z + margin),
  }
}

/** Exponential ease toward `to`: covers 1 - exp(-dt/tau) of the gap, never overshoots. */
export function easeTarget(from: Point3, to: Point3, dt: number, tau = 0.1): Point3 {
  const k = tau > 0 ? 1 - Math.exp(-Math.max(0, dt) / tau) : 1
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    z: from.z + (to.z - from.z) * k,
  }
}
