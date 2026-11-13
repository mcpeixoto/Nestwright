import { closestPointOnSegment, pointInPolygon } from './geometry'
import type { Level, Opening, OpeningType, Vec2, Wall } from './types'
import { openingInterval, pointAlongWall, wallLength } from './walls'

const PASSABLE: ReadonlySet<OpeningType> = new Set([
  'door',
  'double-door',
  'sliding-door',
  'garage-door',
  'arch',
])

export function isPassableOpening(type: string): boolean {
  return PASSABLE.has(type as OpeningType)
}

export interface ThickSegment {
  a: Vec2
  b: Vec2
  halfWidth: number
}

export interface Footprint {
  corners: readonly Vec2[]
}

interface Push {
  nx: number
  ny: number
  depth: number
}

/** Solid centre-line pieces of a wall. Door-like openings are gaps; windows stay solid. */
export function solidSegments(wall: Wall, openings: readonly Opening[]): ThickSegment[] {
  const length = wallLength(wall)
  if (length < 1e-4) return []
  const gaps = openings
    .filter((opening) => opening.wallId === wall.id && isPassableOpening(opening.type))
    .map((opening) => openingInterval(wall, opening))
    .filter((gap) => gap.end - gap.start > 0.04)
    .sort((a, b) => a.start - b.start)

  const merged: { start: number; end: number }[] = []
  for (const gap of gaps) {
    const last = merged[merged.length - 1]
    if (last && gap.start <= last.end + 1e-3) last.end = Math.max(last.end, gap.end)
    else merged.push({ start: gap.start, end: gap.end })
  }

  const spans: { start: number; end: number }[] = []
  let cursor = 0
  for (const gap of merged) {
    if (gap.start > cursor + 1e-3) spans.push({ start: cursor, end: gap.start })
    cursor = Math.max(cursor, gap.end)
  }
  if (cursor < length - 1e-3) spans.push({ start: cursor, end: length })

  const halfWidth = Math.max(0.01, wall.thickness / 2)
  const out: ThickSegment[] = []
  for (const span of spans) {
    const a = pointAlongWall(wall, span.start)
    const b = pointAlongWall(wall, span.end)
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.02) continue
    out.push({ a, b, halfWidth })
  }
  return out
}

export function levelObstacles(level: Level): ThickSegment[] {
  const out: ThickSegment[] = []
  for (const wall of level.walls) {
    if (wall.kind === 'railing') continue
    out.push(...solidSegments(wall, level.openings))
  }
  return out
}

/** Plan rectangle. Rotation is counter-clockwise, matching placed items. */
export function rectFootprint(position: Vec2, w: number, d: number, rotation: number): Footprint {
  const hw = w / 2
  const hd = d / 2
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  return {
    corners: local.map((p) => ({
      x: position.x + p.x * c - p.y * s,
      y: position.y + p.x * s + p.y * c,
    })),
  }
}

function circleSegment(pos: Vec2, radius: number, a: Vec2, b: Vec2, prefer: Vec2): Push | null {
  const hit = closestPointOnSegment(pos, a, b)
  const dx = pos.x - hit.point.x
  const dy = pos.y - hit.point.y
  const dist = Math.hypot(dx, dy)
  if (dist >= radius) return null
  if (dist < 1e-6) {
    const pl = Math.hypot(prefer.x, prefer.y)
    if (pl > 1e-8) return { nx: prefer.x / pl, ny: prefer.y / pl, depth: radius }
    const abx = b.x - a.x
    const aby = b.y - a.y
    const al = Math.hypot(abx, aby) || 1
    return { nx: -aby / al, ny: abx / al, depth: radius }
  }
  return { nx: dx / dist, ny: dy / dist, depth: radius - dist }
}

function circleFootprint(pos: Vec2, radius: number, footprint: Footprint): Push | null {
  const corners = footprint.corners
  if (corners.length < 3) return null
  let cx = 0
  let cy = 0
  for (const p of corners) {
    cx += p.x
    cy += p.y
  }
  cx /= corners.length
  cy /= corners.length
  let nearest = Infinity
  let nx = 0
  let ny = 0
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    if (!a || !b) continue
    const hit = closestPointOnSegment(pos, a, b)
    const d = Math.hypot(pos.x - hit.point.x, pos.y - hit.point.y)
    if (d >= nearest) continue
    nearest = d
    const ox = hit.point.x - cx
    const oy = hit.point.y - cy
    const ol = Math.hypot(ox, oy) || 1
    nx = ox / ol
    ny = oy / ol
  }
  const inside = pointInPolygon(pos, corners)
  if (!inside && nearest >= radius) return null
  const depth = inside ? nearest + radius : radius - nearest
  if (depth <= 0) return null
  return { nx, ny, depth }
}

/**
 * Move a circle by `delta`, sliding along walls. `radius` is the body radius;
 * each segment adds its own half-width. Footprints are solid convex shapes.
 */
export function moveCircle(
  origin: Vec2,
  radius: number,
  delta: Vec2,
  segments: readonly ThickSegment[],
  footprints: readonly Footprint[] = [],
): Vec2 {
  const travel = Math.hypot(delta.x, delta.y)
  if (travel < 1e-8) return { x: origin.x, y: origin.y }
  const steps = Math.max(1, Math.ceil(travel / Math.max(0.04, radius * 0.45)))
  const step = { x: delta.x / steps, y: delta.y / steps }
  let x = origin.x
  let y = origin.y
  for (let s = 0; s < steps; s++) {
    x += step.x
    y += step.y
    const prefer = { x: -step.x, y: -step.y }
    for (let iter = 0; iter < 4; iter++) {
      let worst: Push | null = null
      const pos = { x, y }
      for (const seg of segments) {
        const hit = circleSegment(pos, radius + seg.halfWidth, seg.a, seg.b, prefer)
        if (hit && (!worst || hit.depth > worst.depth)) worst = hit
      }
      for (const footprint of footprints) {
        const hit = circleFootprint(pos, radius, footprint)
        if (hit && (!worst || hit.depth > worst.depth)) worst = hit
      }
      if (!worst) break
      x += worst.nx * (worst.depth + 1e-4)
      y += worst.ny * (worst.depth + 1e-4)
    }
  }
  return { x, y }
}
