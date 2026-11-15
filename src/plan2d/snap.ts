import { noteSnapPoint } from '../audio/cue'
import { add, dist, dot, lerp, perp, scale, snapAngle, snapToGrid, sub } from '../model/geometry'
import type { Level, Vec2 } from '../model/types'
import { locateOnWall, wallDirection } from '../model/walls'

export interface SnapSettings {
  grid: boolean
  ends: boolean
  angles: boolean
}

/**
 * Grid (5 cm), endpoints, midpoints, the wall centre-line, a perpendicular
 * from the previous point, then 15° from that point. Shift skips all of it.
 * Joints win over the grid so a chain actually closes.
 */
export function snapPlanPoint(
  raw: Vec2,
  level: Level,
  opts: {
    prev: Vec2 | null
    extra: readonly Vec2[]
    shift: boolean
    zoom: number
    settings: SnapSettings
  },
): Vec2 {
  const { point, hard } = resolveSnapPlanPoint(raw, level, opts)
  // Only feature snaps (ends, midpoints, wall lines, perpendiculars) tick; grid and angle
  // rounding change on almost every pointer move and would chatter.
  if (hard) noteSnapPoint(raw, point)
  return point
}

function resolveSnapPlanPoint(
  raw: Vec2,
  level: Level,
  opts: {
    prev: Vec2 | null
    extra: readonly Vec2[]
    shift: boolean
    zoom: number
    settings: SnapSettings
  },
): { point: Vec2; hard: boolean } {
  if (opts.shift) return { point: { x: raw.x, y: raw.y }, hard: false }
  const tol = 14 / (50 * Math.max(opts.zoom, 0.05))
  type Cand = { p: Vec2; pri: number; d: number }
  const cands: Cand[] = []

  if (opts.settings.ends) {
    const points = [...opts.extra]
    for (const wall of level.walls) {
      points.push(wall.a, wall.b, lerp(wall.a, wall.b, 0.5))
    }
    for (const p of points) {
      const d = dist(raw, p)
      if (d <= tol) cands.push({ p: { x: p.x, y: p.y }, pri: 0, d })
    }
    for (const wall of level.walls) {
      const loc = locateOnWall(wall, raw)
      if (loc.distanceToWall <= tol) cands.push({ p: { x: loc.point.x, y: loc.point.y }, pri: 1, d: loc.distanceToWall })
    }
  }

  if (opts.prev && opts.settings.angles) {
    for (const wall of level.walls) {
      const n = perp(wallDirection(wall))
      if (dot(n, n) < 1e-8) continue
      const t = dot(sub(raw, opts.prev), n)
      const projected = add(opts.prev, scale(n, t))
      const d = dist(raw, projected)
      if (d <= tol && dist(projected, opts.prev) > 0.02) cands.push({ p: projected, pri: 2, d })
    }
  }

  cands.sort((a, b) => a.pri - b.pri || a.d - b.d)
  const hard = cands.find((c) => c.pri <= 2)
  if (hard) return { point: hard.p, hard: true }

  let point = opts.settings.grid ? snapToGrid(raw, 0.05) : { x: raw.x, y: raw.y }
  if (opts.settings.angles && opts.prev && dist(opts.prev, point) > 1e-4) {
    point = snapAngle(opts.prev, point, Math.PI / 12)
  }
  return { point, hard: false }
}

export function screenTol(zoom: number, pixels: number): number {
  return pixels / (50 * Math.max(zoom, 0.05))
}

export function itemCorners(position: Vec2, w: number, d: number, rotation: number): Vec2[] {
  const hw = w / 2
  const hd = d / 2
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  return local.map((p) => ({
    x: position.x + p.x * c - p.y * s,
    y: position.y + p.x * s + p.y * c,
  }))
}

export function pointInItem(point: Vec2, position: Vec2, w: number, d: number, rotation: number): boolean {
  const dx = point.x - position.x
  const dy = point.y - position.y
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  const lx = dx * c + dy * s
  const ly = -dx * s + dy * c
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= d / 2
}
