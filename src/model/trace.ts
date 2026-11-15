import { add, dist, rotate, sub } from './geometry'
import type { TraceImage, Vec2 } from './types'

/** Axis-aligned plan bounds of a trace image. */
export interface TraceBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Plan rectangle currently on screen, in metres. */
export interface TraceView {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Image pixel → plan. Pixel y grows downward; plan y grows upward, so the
 * picture is not drawn upside down. Rotation is counter-clockwise about the
 * image's top-left corner (`origin`).
 */
export function pixelToPlan(trace: TraceImage, pixel: Vec2): Vec2 {
  const local = { x: pixel.x * trace.scale, y: -pixel.y * trace.scale }
  return add(trace.origin, rotate(local, trace.rotation))
}

/** Inverse of {@link pixelToPlan}. */
export function planToPixel(trace: TraceImage, plan: Vec2): Vec2 {
  if (!(trace.scale > 0)) return { x: 0, y: 0 }
  const local = rotate(sub(plan, trace.origin), -trace.rotation)
  return { x: local.x / trace.scale, y: -local.y / trace.scale }
}

/**
 * Scale the image so the plan distance between `p1` and `p2` becomes `metres`.
 * `p1` stays on the same image pixel, which moves `origin`. Degenerate input
 * (same point, non-positive metres, unusable scale) returns `trace` unchanged.
 */
export function calibrateTrace(trace: TraceImage, p1: Vec2, p2: Vec2, metres: number): TraceImage {
  if (!(trace.scale > 0) || !(metres > 0)) return trace
  const apart = dist(p1, p2)
  if (!(apart > 1e-9)) return trace
  const pixel = planToPixel(trace, p1)
  const scale = trace.scale * (metres / apart)
  const local = { x: pixel.x * scale, y: -pixel.y * scale }
  return {
    ...trace,
    scale,
    origin: sub(p1, rotate(local, trace.rotation)),
    calibrated: true,
  }
}

/** Corners of the `width`×`height` image, in plan metres. */
export function traceBounds(trace: TraceImage, width: number, height: number): TraceBounds {
  const corners = [
    pixelToPlan(trace, { x: 0, y: 0 }),
    pixelToPlan(trace, { x: width, y: 0 }),
    pixelToPlan(trace, { x: width, y: height }),
    pixelToPlan(trace, { x: 0, y: height }),
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const corner of corners) {
    minX = Math.min(minX, corner.x)
    minY = Math.min(minY, corner.y)
    maxX = Math.max(maxX, corner.x)
    maxY = Math.max(maxY, corner.y)
  }
  return { minX, minY, maxX, maxY }
}

/** True when `point` lies on the image rectangle. Needs stored pixel size. */
export function traceContains(trace: TraceImage, point: Vec2): boolean {
  const width = trace.width
  const height = trace.height
  if (!(width && width > 0) || !(height && height > 0)) return false
  const pixel = planToPixel(trace, point)
  return pixel.x >= -1e-6 && pixel.y >= -1e-6 && pixel.x <= width + 1e-6 && pixel.y <= height + 1e-6
}

/**
 * Place a freshly imported image so its longer fit fills about 80% of `view`,
 * centred, unrotated, before the user calibrates.
 */
export function fitTraceToView(input: {
  levelId: string
  src: string
  width: number
  height: number
  view: TraceView
  opacity?: number
}): TraceImage {
  const pxW = Math.max(input.width, 1)
  const pxH = Math.max(input.height, 1)
  let viewW = input.view.maxX - input.view.minX
  let viewH = input.view.maxY - input.view.minY
  let minX = input.view.minX
  let minY = input.view.minY
  if (!(viewW > 0) || !(viewH > 0)) {
    minX = 0
    minY = 0
    viewW = 10
    viewH = 8
  }
  const scale = Math.min((viewW * 0.8) / pxW, (viewH * 0.8) / pxH)
  const worldW = pxW * scale
  const worldH = pxH * scale
  const centerX = minX + viewW / 2
  const centerY = minY + viewH / 2
  return {
    levelId: input.levelId,
    src: input.src,
    origin: { x: centerX - worldW / 2, y: centerY + worldH / 2 },
    scale,
    rotation: 0,
    opacity: input.opacity ?? 0.6,
    width: input.width,
    height: input.height,
    calibrated: false,
  }
}
