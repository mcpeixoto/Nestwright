import { add, dist, dot, lerp, normalize, perp, scale, sub } from './geometry'
import type { Vec2, Wall } from './types'

/** Sagitta knob. Sits on the arc apex, or just off a straight wall so it clears the body. */
export function curveHandle(wall: Wall): Vec2 {
  const mid = lerp(wall.a, wall.b, 0.5)
  const dir = normalize(sub(wall.b, wall.a))
  if (lenOrZero(dir) === 0) return mid
  const n = perp(dir)
  if (Math.abs(wall.bulge) > 0.05) return add(mid, scale(n, wall.bulge))
  return add(mid, scale(n, 0.35))
}

export function bulgeLimit(wall: Wall): number {
  return Math.max(0.05, dist(wall.a, wall.b))
}

/** Signed sagitta, positive to the left of a→b, clamped to the chord length. */
export function clampBulge(wall: Wall, bulge: number): number {
  const limit = bulgeLimit(wall)
  if (!Number.isFinite(bulge)) return 0
  return Math.min(limit, Math.max(-limit, bulge))
}

/** How much the sagitta changes when the pointer moves from `from` to `to`. */
export function bulgeDelta(wall: Wall, from: Vec2, to: Vec2): number {
  const dir = normalize(sub(wall.b, wall.a))
  if (lenOrZero(dir) === 0) return 0
  return dot(sub(to, from), perp(dir))
}

function lenOrZero(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}
