/**
 * How a scanned furniture model is fitted to an item's size. Pure; the view applies the
 * result (src/catalog/models).
 *
 * A model has one natural shape. Close to it, the model is scaled uniformly to fit inside the
 * item's box, so a sofa never looks squashed. Further off, a uniform scale would leave it far
 * smaller than the box the player drew, and a plain per-axis stretch would fatten the arms and
 * legs; instead the model is sliced: the outer `SLICE_END` of each axis keeps the uniform
 * scale and only the middle stretches to fill the box.
 */

export interface Size3 {
  w: number
  d: number
  h: number
}

/** A model's bounding box in its own space (x width, y up, z depth). */
export interface ModelBounds {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

/** Uniform scale is used while the box is within this share of the model's aspect. */
export const ASPECT_TOLERANCE = 0.15
/** Share of each axis, at both ends, that keeps its thickness when a model is sliced. */
export const SLICE_END = 0.15
/** Beyond this distance a model is drawn from its simplified LOD1. */
export const LOD_DISTANCE = 8

/**
 * Piecewise-linear map of one axis: `[lo, lo + end]` and `[hi - end, hi]` scale by `edge`,
 * the middle by `middle`, and `lo` lands on `outLo`.
 */
export interface AxisMap {
  lo: number
  hi: number
  end: number
  outLo: number
  edge: number
  middle: number
}

export type ModelFit =
  | { kind: 'uniform'; scale: number; offset: { x: number; y: number; z: number } }
  | { kind: 'slice'; x: AxisMap; y: AxisMap; z: AxisMap }

function span(bounds: ModelBounds): Size3 {
  return {
    w: Math.max(bounds.max.x - bounds.min.x, 1e-6),
    d: Math.max(bounds.max.z - bounds.min.z, 1e-6),
    h: Math.max(bounds.max.y - bounds.min.y, 1e-6),
  }
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 1e-6 ? value : fallback
}

/**
 * Per-axis ratios of the target box to the model. Their spread (max / min) is how far the
 * box is from the model's aspect: 1 means the same proportions.
 */
export function fitRatios(natural: Size3, target: Size3): Size3 {
  return {
    w: positive(target.w, natural.w) / natural.w,
    d: positive(target.d, natural.d) / natural.d,
    h: positive(target.h, natural.h) / natural.h,
  }
}

export function aspectSpread(natural: Size3, target: Size3): number {
  const r = fitRatios(natural, target)
  return Math.max(r.w, r.d, r.h) / Math.min(r.w, r.d, r.h)
}

/**
 * Slice map for one axis. `scale` is the uniform part (applied to the whole axis, ends
 * included); the middle takes up whatever is left of `outHi - outLo`. With the uniform scale
 * at the smallest ratio the middle only ever stretches, so the map is monotonic.
 */
export function sliceAxis(lo: number, hi: number, outLo: number, outHi: number, scale: number, end = SLICE_END): AxisMap {
  const length = Math.max(hi - lo, 1e-6)
  const out = Math.max(outHi - outLo, 1e-6)
  const endLength = length * end
  const middleLength = length - 2 * endLength
  const middleOut = out - 2 * endLength * scale
  if (middleLength <= 1e-6 || middleOut <= 0) {
    // Too short for fixed ends: plain stretch.
    return { lo, hi, end: 0, outLo, edge: out / length, middle: out / length }
  }
  return { lo, hi, end: endLength, outLo, edge: scale, middle: middleOut / middleLength }
}

/** Where `v` (model space) lands on the item. */
export function mapAxis(map: AxisMap, v: number): number {
  const a = map.lo + map.end
  const b = map.hi - map.end
  if (v <= a) return map.outLo + (v - map.lo) * map.edge
  const head = map.end * map.edge
  if (v <= b) return map.outLo + head + (v - a) * map.middle
  return map.outLo + head + (b - a) * map.middle + (v - b) * map.edge
}

/** Local stretch of the axis at `v` (for transforming normals and tangents). */
export function axisSlope(map: AxisMap, v: number): number {
  if (v < map.lo + map.end || v > map.hi - map.end) return map.edge
  return map.middle
}

/**
 * Fit a model with these bounds into an item box. The item's origin is the bottom centre
 * of its box, like the model's, so the result centres the model on x/z and stands it on y=0.
 */
export function fitModel(bounds: ModelBounds, target: Size3, tolerance = ASPECT_TOLERANCE): ModelFit {
  const natural = span(bounds)
  const r = fitRatios(natural, target)
  const scale = Math.min(r.w, r.d, r.h)
  const cx = (bounds.min.x + bounds.max.x) / 2
  const cz = (bounds.min.z + bounds.max.z) / 2
  if (Math.max(r.w, r.d, r.h) / scale <= 1 + tolerance + 1e-9) {
    return { kind: 'uniform', scale, offset: { x: -cx * scale, y: -bounds.min.y * scale, z: -cz * scale } }
  }
  const w = natural.w * r.w
  const d = natural.d * r.d
  const h = natural.h * r.h
  return {
    kind: 'slice',
    x: sliceAxis(bounds.min.x, bounds.max.x, -w / 2, w / 2, scale),
    y: sliceAxis(bounds.min.y, bounds.max.y, 0, h, scale),
    z: sliceAxis(bounds.min.z, bounds.max.z, -d / 2, d / 2, scale),
  }
}

/** Fitted size of the model's box (uniform fits stay inside the target). */
export function fittedSize(bounds: ModelBounds, fit: ModelFit): Size3 {
  const natural = span(bounds)
  if (fit.kind === 'uniform') return { w: natural.w * fit.scale, d: natural.d * fit.scale, h: natural.h * fit.scale }
  return {
    w: mapAxis(fit.x, bounds.max.x) - mapAxis(fit.x, bounds.min.x),
    d: mapAxis(fit.z, bounds.max.z) - mapAxis(fit.z, bounds.min.z),
    h: mapAxis(fit.y, bounds.max.y) - mapAxis(fit.y, bounds.min.y),
  }
}

function round(value: number): string {
  return (Math.round(value * 1e4) / 1e4).toString()
}

/** Identity of a fit: items with the same model and key share geometry (and instance). */
export function fitKey(fit: ModelFit): string {
  if (fit.kind === 'uniform') return `u${round(fit.scale)}`
  const axis = (m: AxisMap) => `${round(m.outLo)},${round(m.edge)},${round(m.middle)}`
  return `s${axis(fit.x)}|${axis(fit.y)}|${axis(fit.z)}`
}

/**
 * Whether a model should be drawn from LOD1: beyond `LOD_DISTANCE`, scaled with the model's
 * size so a large wardrobe holds its detail further out than a vase (about 1/16 of the
 * distance in radius).
 */
export function wantsLowLod(distance: number, radius: number): boolean {
  const reach = Math.max(LOD_DISTANCE, radius * 16)
  return distance > reach
}
