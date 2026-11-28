import { dist, pointInPolygon, polygonArea } from './geometry'
import { DEFAULT_LEVEL_HEIGHT } from './defaults'
import type { Level, Stair, Vec2 } from './types'

/** Comfort limit: no riser taller than this. */
export const MAX_RISER = 0.19
/** 2R + G, in metres. Going comes out near 0.27 when the riser is 0.18. */
export const COMFORT = 0.63
const SPIRAL_INNER = 0.15
const SPIRAL_MIN = Math.PI * 1.5
const SPIRAL_MAX = Math.PI * 2

export interface StairStep {
  polygon: Vec2[]
  /** Tread top, metres above the stair base. */
  height: number
  landing: boolean
}

export interface StairLayout {
  rise: number
  count: number
  riser: number
  going: number
  steps: StairStep[]
  /** Plan opening the floor above should cut. */
  hole: Vec2[]
}

export function resolvedRise(stair: Stair, levelHeight: number): number {
  if (stair.rise > 0.05) return stair.rise
  if (levelHeight > 0.05) return levelHeight
  return DEFAULT_LEVEL_HEIGHT
}

/**
 * Step count keeps every riser ≤ 0.19 m. Going follows 2R+G = 0.63, so a 2.7 m
 * storey lands on a 0.18 m riser and a 0.27 m going. Total rise is exact.
 */
export function computeStairSteps(stair: Stair, levelHeight: number): StairLayout {
  const rise = resolvedRise(stair, levelHeight)
  const count = Math.max(1, Math.ceil(rise / MAX_RISER - 1e-9))
  const riser = rise / count
  const going = COMFORT - 2 * riser
  const width = Math.max(0.2, stair.width)
  const steps =
    stair.shape === 'l-shape'
      ? ellSteps(stair, count, riser, going, width)
      : stair.shape === 'u-shape'
        ? youSteps(stair, count, riser, going, width)
        : stair.shape === 'spiral'
          ? spiralSteps(stair, count, riser, going, width)
          : straightSteps(stair, count, riser, going, width)
  return {
    rise,
    count,
    riser,
    going,
    steps,
    hole: holeOf(stair.shape, steps, stair),
  }
}

/** Plan polygon of the opening a stair cuts in the floor above. */
export function stairHoleOutline(stair: Stair): Vec2[] {
  return computeStairSteps(stair, stair.rise).hole
}

/** Walking-surface height above the stair base, or null outside every tread. */
export function stairHeightAt(stair: Stair, point: Vec2, levelHeight = stair.rise): number | null {
  const layout = computeStairSteps(stair, levelHeight)
  let best: number | null = null
  for (const step of layout.steps) {
    if (step.polygon.length < 3) continue
    if (!pointInPolygon(point, step.polygon)) continue
    if (best == null || step.height > best) best = step.height
  }
  return best
}

function basis(stair: Stair): { dir: Vec2; left: Vec2 } {
  const dir = { x: Math.cos(stair.rotation), y: Math.sin(stair.rotation) }
  return { dir, left: { x: -dir.y, y: dir.x } }
}

function place(origin: Vec2, dir: Vec2, left: Vec2, u: number, v: number): Vec2 {
  return { x: origin.x + dir.x * u + left.x * v, y: origin.y + dir.y * u + left.y * v }
}

function rect(origin: Vec2, dir: Vec2, left: Vec2, u0: number, u1: number, v0: number, v1: number): Vec2[] {
  return [
    place(origin, dir, left, u0, v0),
    place(origin, dir, left, u1, v0),
    place(origin, dir, left, u1, v1),
    place(origin, dir, left, u0, v1),
  ]
}

function straightSteps(stair: Stair, count: number, riser: number, going: number, width: number): StairStep[] {
  const { dir, left } = basis(stair)
  const half = width / 2
  const steps: StairStep[] = []
  for (let i = 0; i < count; i++) {
    steps.push({
      polygon: rect(stair.position, dir, left, i * going, (i + 1) * going, -half, half),
      height: (i + 1) * riser,
      landing: false,
    })
  }
  return steps
}

function splitFlights(count: number): { before: number; after: number } {
  const before = Math.floor((count - 1) / 2)
  const after = count - 1 - before
  return { before, after }
}

function ellSteps(stair: Stair, count: number, riser: number, going: number, width: number): StairStep[] {
  const { dir, left } = basis(stair)
  const half = width / 2
  const { before, after } = splitFlights(count)
  const side = stair.turnLeft === false ? -1 : 1
  const len1 = before * going
  const steps: StairStep[] = []
  for (let i = 0; i < before; i++) {
    steps.push({
      polygon: rect(stair.position, dir, left, i * going, (i + 1) * going, -half, half),
      height: (i + 1) * riser,
      landing: false,
    })
  }
  steps.push({
    polygon: rect(stair.position, dir, left, len1, len1 + width, -half, half),
    height: (before + 1) * riser,
    landing: true,
  })
  for (let j = 0; j < after; j++) {
    const v0 = side > 0 ? half + j * going : -half - (j + 1) * going
    const v1 = side > 0 ? half + (j + 1) * going : -half - j * going
    steps.push({
      polygon: rect(stair.position, dir, left, len1, len1 + width, v0, v1),
      height: (before + 2 + j) * riser,
      landing: false,
    })
  }
  return steps
}

function youSteps(stair: Stair, count: number, riser: number, going: number, width: number): StairStep[] {
  const { dir, left } = basis(stair)
  const half = width / 2
  const { before, after } = splitFlights(count)
  const side = stair.turnLeft === false ? -1 : 1
  const len1 = before * going
  const steps: StairStep[] = []
  for (let i = 0; i < before; i++) {
    steps.push({
      polygon: rect(stair.position, dir, left, i * going, (i + 1) * going, -half, half),
      height: (i + 1) * riser,
      landing: false,
    })
  }
  const landV0 = side > 0 ? -half : -half - width
  const landV1 = side > 0 ? half + width : half
  steps.push({
    polygon: rect(stair.position, dir, left, len1, len1 + width, landV0, landV1),
    height: (before + 1) * riser,
    landing: true,
  })
  for (let j = 0; j < after; j++) {
    const u0 = len1 - (j + 1) * going
    const u1 = len1 - j * going
    const v0 = side > 0 ? half : -half - width
    const v1 = side > 0 ? half + width : -half
    steps.push({
      polygon: rect(stair.position, dir, left, u0, u1, v0, v1),
      height: (before + 2 + j) * riser,
      landing: false,
    })
  }
  return steps
}

function spiralSteps(stair: Stair, count: number, riser: number, going: number, width: number): StairStep[] {
  const inner = SPIRAL_INNER
  const outer = inner + width
  const walk = inner + width * 0.5
  let wedge = walk > 1e-6 ? going / walk : Math.PI / 8
  const sweep = count * wedge
  if (sweep < SPIRAL_MIN) wedge = SPIRAL_MIN / count
  else if (sweep > SPIRAL_MAX) wedge = SPIRAL_MAX / count
  const steps: StairStep[] = []
  for (let i = 0; i < count; i++) {
    const a0 = stair.rotation + i * wedge
    const a1 = stair.rotation + (i + 1) * wedge
    steps.push({
      polygon: wedgePoly(stair.position, inner, outer, a0, a1),
      height: (i + 1) * riser,
      landing: false,
    })
  }
  return steps
}

function wedgePoly(centre: Vec2, inner: number, outer: number, a0: number, a1: number): Vec2[] {
  const steps = 4
  const pts: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    const ang = a0 + ((a1 - a0) * i) / steps
    pts.push({ x: centre.x + Math.cos(ang) * outer, y: centre.y + Math.sin(ang) * outer })
  }
  for (let i = steps; i >= 0; i--) {
    const ang = a0 + ((a1 - a0) * i) / steps
    pts.push({ x: centre.x + Math.cos(ang) * inner, y: centre.y + Math.sin(ang) * inner })
  }
  return pts
}

function holeOf(shape: Stair['shape'], steps: StairStep[], stair: Stair): Vec2[] {
  if (steps.length === 0) return []
  if (shape === 'straight') return steps.length === 1 ? (steps[0]?.polygon ?? []) : straightHole(stair, steps)
  if (shape === 'spiral') return spiralHole(steps)
  if (shape === 'l-shape') return ellHole(stair, steps)
  return youHole(stair, steps)
}

function straightHole(stair: Stair, steps: StairStep[]): Vec2[] {
  const first = steps[0]
  const last = steps[steps.length - 1]
  if (!first || !last) return []
  const { dir, left } = basis(stair)
  const half = Math.max(0.2, stair.width) / 2
  const going = dist(first.polygon[0] ?? stair.position, first.polygon[1] ?? stair.position)
  const total = Math.max(going, steps.length * going)
  return rect(stair.position, dir, left, 0, total, -half, half)
}

function ellHole(stair: Stair, steps: StairStep[]): Vec2[] {
  const { dir, left } = basis(stair)
  const width = Math.max(0.2, stair.width)
  const half = width / 2
  const landing = steps.find((step) => step.landing)
  const before = steps.filter((step) => !step.landing && step.height < (landing?.height ?? Infinity))
  const after = steps.filter((step) => !step.landing && step.height > (landing?.height ?? -1))
  const going = before[0] ? runDepth(before[0].polygon) : after[0] ? runDepth(after[0].polygon) : width
  const len1 = before.length * going
  const run2 = after.length * going
  const side = stair.turnLeft === false ? -1 : 1
  const vFar = side > 0 ? half + run2 : -half - run2
  const vNear = side > 0 ? half : -half
  const raw = [
    place(stair.position, dir, left, 0, -half),
    place(stair.position, dir, left, len1 + width, -half),
    place(stair.position, dir, left, len1 + width, side > 0 ? vFar : -half),
    place(stair.position, dir, left, len1, side > 0 ? vFar : vFar),
    place(stair.position, dir, left, len1, side > 0 ? vNear : vNear),
    place(stair.position, dir, left, 0, half),
  ]
  if (side < 0) {
    return [
      place(stair.position, dir, left, 0, half),
      place(stair.position, dir, left, 0, -half),
      place(stair.position, dir, left, len1, -half),
      place(stair.position, dir, left, len1, vFar),
      place(stair.position, dir, left, len1 + width, vFar),
      place(stair.position, dir, left, len1 + width, half),
    ]
  }
  return raw
}

function youHole(stair: Stair, steps: StairStep[]): Vec2[] {
  const { dir, left } = basis(stair)
  const width = Math.max(0.2, stair.width)
  const half = width / 2
  const landing = steps.find((step) => step.landing)
  const before = steps.filter((step) => !step.landing && step.height < (landing?.height ?? Infinity))
  const after = steps.filter((step) => !step.landing && step.height > (landing?.height ?? -1))
  const going = before[0] ? runDepth(before[0].polygon) : width
  const len1 = before.length * going
  const len2 = after.length * going
  const side = stair.turnLeft === false ? -1 : 1
  if (side > 0) {
    return [
      place(stair.position, dir, left, 0, -half),
      place(stair.position, dir, left, len1 + width, -half),
      place(stair.position, dir, left, len1 + width, half + width),
      place(stair.position, dir, left, len1 - len2, half + width),
      place(stair.position, dir, left, len1 - len2, half),
      place(stair.position, dir, left, 0, half),
    ]
  }
  return [
    place(stair.position, dir, left, 0, half),
    place(stair.position, dir, left, 0, -half),
    place(stair.position, dir, left, len1 - len2, -half),
    place(stair.position, dir, left, len1 - len2, -half - width),
    place(stair.position, dir, left, len1 + width, -half - width),
    place(stair.position, dir, left, len1 + width, half),
  ]
}

function spiralHole(steps: StairStep[]): Vec2[] {
  const outer: Vec2[] = []
  const inner: Vec2[] = []
  for (const step of steps) {
    const mid = Math.floor(step.polygon.length / 2)
    const o = step.polygon.slice(0, mid)
    const inn = step.polygon.slice(mid)
    if (outer.length === 0) outer.push(...o)
    else outer.push(...o.slice(1))
    if (inner.length === 0) inner.push(...inn)
    else inner.push(...inn.slice(1))
  }
  // Each wedge stores its inner arc from its own end angle back to its start,
  // and wedges are in ascending angle, so reverse the concatenated inner chain
  // to walk back along the whole sweep.
  inner.reverse()
  const ring = [...outer, ...inner]
  if (polygonArea(ring) < 0) ring.reverse()
  return ring.length >= 3 ? ring : []
}

function runDepth(polygon: Vec2[]): number {
  if (polygon.length < 2) return 0
  const a = polygon[0]
  const b = polygon[1]
  if (!a || !b) return 0
  return dist(a, b)
}

/** Plan cut used by the 2D stair symbol. Steps above this height are broken off. */
export function cutHeight(): number {
  return 1.2
}

/**
 * Absolute walking height over a stair's treads, or null off them. Replaces the walk rig's
 * local ramp, which ran 90 degrees off the built flight; treads match what the builder draws.
 */
export function stairRampHeightAt(stair: Stair, level: Level, x: number, y: number): number | null {
  const height = stairHeightAt(stair, { x, y }, level.height)
  return height == null ? null : level.elevation + height
}
