import type { Vec2 } from '../model/types'

/** Longest typed buffer, e.g. `13' 10 1/2" x 10' 6"`. */
const MAX_TYPED = 28

/**
 * Feed one key into a typed length (or `width x depth` when `size` is set).
 * Digits, `.`, `,`, `'` and `"` start a buffer; letters, spaces and `/` only extend
 * one, so tool shortcuts still work when nothing is being typed. Returns the new
 * buffer, or null when the key is not part of a length.
 */
export function typeKey(buffer: string, key: string, size = false): string | null {
  if (key.length !== 1 || buffer.length >= MAX_TYPED) return null
  if (/^[0-9.,'"]$/.test(key)) return buffer + key
  if (buffer.length === 0) return null
  if (/^[ /\-cdefhimnost]$/i.test(key)) return buffer + key.toLowerCase()
  if (size && /^[x×*]$/i.test(key) && !/[x×*]/i.test(buffer)) return buffer + key.toLowerCase()
  return null
}

/** Unit vector sign of `to - from` on one axis, defaulting to +1. */
export function axisSign(from: number, to: number): 1 | -1 {
  return to - from < 0 ? -1 : 1
}

/** Corner opposite `start` for a typed `width x depth`, toward where the pointer is. */
export function typedCorner(start: Vec2, toward: Vec2, size: { w: number; d: number }): Vec2 {
  return {
    x: start.x + axisSign(start.x, toward.x) * size.w,
    y: start.y + axisSign(start.y, toward.y) * size.d,
  }
}
