import type { GraphicsQuality } from '../../settings'

/**
 * Sun cascades per tier. Kept here rather than in `render/quality.ts` because the counts
 * are read only by the CSM setup, and changing them rebuilds the shadow node.
 */
export interface SunShadowTier {
  cascades: number
  mapSize: number
}

const SUN_TIERS: Record<GraphicsQuality, SunShadowTier> = {
  low: { cascades: 2, mapSize: 1024 },
  medium: { cascades: 3, mapSize: 2048 },
  high: { cascades: 3, mapSize: 2048 },
  ultra: { cascades: 4, mapSize: 4096 },
}

export function sunShadowTier(tier: GraphicsQuality): SunShadowTier {
  return SUN_TIERS[tier] ?? SUN_TIERS.high
}

/** Weight of the logarithmic split against the uniform one. Higher keeps the first cascade tighter. */
export const SPLIT_LAMBDA = 0.85

export interface CascadeSplitInput {
  cascades: number
  /** Camera near plane, metres. Cascade 0 always starts here. */
  near: number
  /** Far end of the last cascade, metres. */
  far: number
  /**
   * Distance from the camera to the nearest shadowed content. An aerial camera has nothing
   * in front of it for the first 20 m, so the splits are spread from there instead of `near`.
   */
  start?: number
  /** Indoors: every cascade but the last fits inside this distance (the room), the last reaches `far`. */
  focus?: number | null
  lambda?: number
}

function practical(count: number, from: number, to: number, lambda: number, out: number[]): void {
  const a = Math.max(from, 1e-3)
  for (let i = 1; i < count; i++) {
    const t = i / count
    const uniform = a + (to - a) * t
    const log = a * (to / a) ** t
    out.push(uniform + (log - uniform) * lambda)
  }
}

/**
 * Cascade far ends as fractions of `far` (the CSMShadowNode `breaks` format): ascending,
 * the last one exactly 1. Practical split (uniform/log blend) between `start` and `far`,
 * or, indoors, between `near` and `focus` with the last cascade covering the rest.
 */
export function cascadeBreaks(input: CascadeSplitInput): number[] {
  const count = Math.max(1, Math.floor(input.cascades))
  const near = Number.isFinite(input.near) && input.near > 0 ? input.near : 0.1
  const far = Number.isFinite(input.far) && input.far > near ? input.far : near + 1
  const lambda = Number.isFinite(input.lambda) ? Math.min(1, Math.max(0, input.lambda ?? SPLIT_LAMBDA)) : SPLIT_LAMBDA
  const ends: number[] = []
  const focus = input.focus
  if (count > 1 && focus != null && Number.isFinite(focus) && focus > near * 2 && focus < far * 0.9) {
    practical(count - 1, near, focus, lambda, ends)
    ends.push(focus)
  } else if (count > 1) {
    const raw = input.start
    const start = raw != null && Number.isFinite(raw) ? Math.min(Math.max(raw, near), far * 0.5) : near
    practical(count, start, far, lambda, ends)
  }
  const out: number[] = []
  let last = 0
  for (const end of ends) {
    // Strictly ascending, so no cascade collapses to zero depth.
    const value = Math.min(0.999, Math.max(end / far, last + 1e-3))
    out.push(value)
    last = value
  }
  out.push(1)
  return out
}

/**
 * Keeps `prev` while `next` is within `tolerance` (relative) of it, otherwise snaps `next`
 * up to the `step` grid. Re-splitting changes every cascade's size, which shifts the texel
 * grid and makes shadows swim, so the inputs only move in coarse jumps.
 */
export function holdOrSnap(prev: number | null, next: number, tolerance: number, step: number): number {
  if (!Number.isFinite(next)) return prev ?? 0
  if (prev != null && Number.isFinite(prev) && prev > 0 && Math.abs(next - prev) <= prev * tolerance) return prev
  return step > 0 ? Math.ceil(next / step) * step : next
}

/**
 * Whether cascade `index` re-renders on `frame` while the camera moves. The first cascade
 * (what is around the camera) renders every frame, the second every 2nd, the third every
 * 4th, the fourth every 8th, never two coarse ones on the same frame. A skipped cascade
 * keeps the light matrix of its last render, so its map stays consistent; it only lags.
 */
export function cascadeDue(index: number, count: number, frame: number): boolean {
  if (index <= 0 || count <= 1) return true
  const f = Math.max(0, Math.floor(frame))
  if (index === 1) return f % 2 === 0
  if (index === 2) return f % 4 === 1
  return f % 8 === 3
}

export interface CascadeRefresh {
  index: number
  count: number
  frame: number
  /** The view camera moved since the last frame. */
  moving: boolean
  /** Moon key light: dim, so the far cascade can lag more. */
  night: boolean
  /** Aerial view: nothing within several metres of the camera, so the first cascade may lag too. */
  wide?: boolean
}

/**
 * Re-render plan for one cascade. While the camera moves: cascadeDue, with the moon's last
 * cascade only every 8th frame. While it is still: one cascade every few frames in turn,
 * just enough to keep swaying plant shadows alive (8 frames by day, 16 by moonlight).
 */
export function cascadeRefresh(input: CascadeRefresh): boolean {
  const { index, count, moving, night } = input
  const frame = Math.max(0, Math.floor(input.frame))
  if (moving) {
    if (night && count > 2 && index === count - 1) return frame % 8 === 7
    if (input.wide) {
      // Aerial: even the first cascade is tens of metres wide and a frame of lag is invisible.
      // Cascade i every 2^(i+1) frames at offset 2^i - 1: 0 on even frames, 1 on 1 mod 4, …
      return frame % 2 ** (index + 1) === 2 ** index - 1
    }
    return cascadeDue(index, count, frame)
  }
  const period = night ? 16 : 8
  return frame % period === index
}

export interface CascadeTuning {
  /** Depth bias, in the shadow map's normalised [0,1] depth. */
  bias: number
  /** World-space offset along the receiver normal, metres. */
  normalBias: number
  /** PCF radius in texels. */
  radius: number
}

/**
 * Bias that scales with the cascade's texel size, so the sharp first cascade does not
 * peter-pan under furniture and the coarse last one does not get acne on the lawn.
 */
export function cascadeTuning(index: number, width: number, mapSize: number, depthRange: number): CascadeTuning {
  const size = mapSize > 0 ? mapSize : 1024
  const texel = Math.max(1e-4, width / size)
  const range = depthRange > 0 ? depthRange : 100
  return {
    bias: -(texel * 0.6 + 0.002) / range,
    normalBias: texel * 1.4,
    // Near cascade: tight PCF for a crisp contact edge. Further out the texels are already large.
    radius: index === 0 ? 1 : index === 1 ? 1.4 : 1.8,
  }
}
