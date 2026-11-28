import {
  add,
  arcCircle,
  arcPoints,
  closestPointOnSegment,
  dist,
  dot,
  len,
  lerp,
  lineIntersection,
  normalize,
  perp,
  scale,
  sub,
  type ArcCircle,
} from './geometry'
import { newId } from './ids'
import type { Level, Opening, Vec2, Wall } from './types'

/** Endpoints closer than this are the same joint. Matches room detection. */
export const JOIN_EPS = 0.001

export interface WallFrame {
  length: number
  points: Vec2[]
  cum: number[]
  tangents: Vec2[]
}

export function wallDirection(wall: Wall): Vec2 {
  return normalize(sub(wall.b, wall.a))
}

export function wallLength(wall: Wall): number {
  if (Math.abs(wall.bulge) < 1e-9) return dist(wall.a, wall.b)
  const circle = arcCircle(wall.a, wall.b, wall.bulge)
  if (!circle) return dist(wall.a, wall.b)
  return Math.abs(circle.sweep) * circle.radius
}

/** Direction from an endpoint, travelling into the wall. */
export function outwardAlong(wall: Wall, end: 'a' | 'b'): Vec2 {
  const chordInto = end === 'a' ? normalize(sub(wall.b, wall.a)) : normalize(sub(wall.a, wall.b))
  if (len(chordInto) < 1e-8) return { x: 0, y: 0 }
  if (Math.abs(wall.bulge) < 1e-8) return chordInto
  const circle = arcCircle(wall.a, wall.b, wall.bulge)
  if (!circle) return chordInto
  const ang = end === 'a' ? circle.start : circle.start + circle.sweep
  // Tangent pointing in the direction of a positive angle sweep.
  let tangent = { x: -Math.sin(ang), y: Math.cos(ang) }
  const followSweep = end === 'a' ? circle.sweep >= 0 : circle.sweep < 0
  if (!followSweep) tangent = scale(tangent, -1)
  if (len(tangent) < 1e-8) return chordInto
  return tangent
}

export function wallFrame(wall: Wall): WallFrame {
  const straight = Math.abs(wall.bulge) < 1e-8
  const chord = dist(wall.a, wall.b)
  const points = straight
    ? [
        { x: wall.a.x, y: wall.a.y },
        { x: wall.b.x, y: wall.b.y },
      ]
    : arcPoints(wall.a, wall.b, wall.bulge, Math.max(2, Math.ceil(chord / 0.3)))
  const cum: number[] = [0]
  const tangents: Vec2[] = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    if (!prev || !curr) continue
    const d = dist(prev, curr)
    cum.push((cum[i - 1] ?? 0) + d)
    tangents.push(normalize(sub(curr, prev)))
  }
  if (tangents.length === 0) tangents.push({ x: 1, y: 0 })
  // One tangent per point: the segment that leaves it (last point reuses the final segment).
  const perPoint = points.map((_, i) => tangents[Math.min(i, tangents.length - 1)] ?? tangents[0]!)
  const length = cum[cum.length - 1] ?? 0
  return { length, points, cum, tangents: perPoint }
}

export interface FrameSample {
  distance: number
  point: Vec2
  tangent: Vec2
  /** Left of the tangent. */
  normal: Vec2
}

export function sampleFrame(frame: WallFrame, distance: number): FrameSample {
  const d = Math.min(frame.length, Math.max(0, distance))
  let seg = 0
  for (let i = 1; i < frame.cum.length; i++) {
    if ((frame.cum[i] ?? 0) >= d - 1e-9) {
      seg = i - 1
      break
    }
    seg = i - 1
  }
  const c0 = frame.cum[seg] ?? 0
  const c1 = frame.cum[seg + 1] ?? c0
  const p0 = frame.points[seg] ?? frame.points[0]!
  const p1 = frame.points[seg + 1] ?? p0
  const span = c1 - c0
  const t = span < 1e-9 ? 0 : (d - c0) / span
  const tangent = frame.tangents[seg] ?? { x: 1, y: 0 }
  return {
    distance: d,
    point: lerp(p0, p1, t),
    tangent,
    normal: perp(tangent),
  }
}

export interface WallLocation {
  point: Vec2
  distance: number
  length: number
  distanceToWall: number
}

/** Closest point on the centre-line. `distance` runs from wall.a. */
export function locateOnWall(wall: Wall, point: Vec2): WallLocation {
  const frame = wallFrame(wall)
  if (frame.length < 1e-8 || frame.points.length < 2) {
    return { point: { x: wall.a.x, y: wall.a.y }, distance: 0, length: 0, distanceToWall: dist(point, wall.a) }
  }
  let bestD = Infinity
  let bestDist = 0
  let bestPoint = frame.points[0]!
  for (let i = 0; i < frame.points.length - 1; i++) {
    const a = frame.points[i]
    const b = frame.points[i + 1]
    if (!a || !b) continue
    const hit = closestPointOnSegment(point, a, b)
    const d = dist(point, hit.point)
    if (d < bestD) {
      bestD = d
      bestPoint = hit.point
      bestDist = (frame.cum[i] ?? 0) + hit.t * dist(a, b)
    }
  }
  return { point: bestPoint, distance: bestDist, length: frame.length, distanceToWall: bestD }
}

interface Ray {
  wall: Wall
  end: 'a' | 'b'
  into: Vec2
  angle: number
}

function raysAt(point: Vec2, walls: readonly Wall[]): Ray[] {
  const seen = new Set<string>()
  const rays: Ray[] = []
  for (const wall of walls) {
    if (seen.has(wall.id)) continue
    seen.add(wall.id)
    if (dist(wall.a, point) <= JOIN_EPS) {
      const into = outwardAlong(wall, 'a')
      if (len(into) > 1e-8) rays.push({ wall, end: 'a', into, angle: Math.atan2(into.y, into.x) })
    } else if (dist(wall.b, point) <= JOIN_EPS) {
      const into = outwardAlong(wall, 'b')
      if (len(into) > 1e-8) rays.push({ wall, end: 'b', into, angle: Math.atan2(into.y, into.x) })
    }
  }
  rays.sort((a, b) => a.angle - b.angle)
  return rays
}

type LocalSide = 'port' | 'starboard'

/** Material side +1 is left of a→b. Port is left when looking from the endpoint into the wall. */
function localSide(end: 'a' | 'b', materialSide: 1 | -1): LocalSide {
  if (end === 'a') return materialSide === 1 ? 'port' : 'starboard'
  return materialSide === 1 ? 'starboard' : 'port'
}

function sideNormal(into: Vec2, side: LocalSide): Vec2 {
  const port = perp(into)
  return side === 'port' ? port : scale(port, -1)
}

/**
 * Mitred corner of one side of a wall. `materialSide` +1 is left of a→b.
 * With no neighbour, or a collinear neighbour, this is the square end.
 */
export function mitrePoint(wall: Wall, end: 'a' | 'b', materialSide: 1 | -1, neighbours: readonly Wall[]): Vec2 {
  const P = wall[end]
  const into = outwardAlong(wall, end)
  const side = localSide(end, materialSide)
  const square = add(P, scale(sideNormal(into, side), wall.thickness / 2))
  if (len(into) < 1e-8) return square
  const unique = [wall, ...neighbours.filter((n) => n.id !== wall.id)]
  const rays = raysAt(P, unique)
  if (rays.length < 2) return square
  const idx = rays.findIndex((r) => r.wall.id === wall.id && r.end === end)
  if (idx < 0) return square
  const n = rays.length
  const neighbour = side === 'port' ? rays[(idx + 1) % n] : rays[(idx - 1 + n) % n]
  if (!neighbour || neighbour.wall.id === wall.id) return square
  const nSide: LocalSide = side === 'port' ? 'starboard' : 'port'
  const nPoint = add(neighbour.wall[neighbour.end], scale(sideNormal(neighbour.into, nSide), neighbour.wall.thickness / 2))
  const hit = lineIntersection(square, add(square, into), nPoint, add(nPoint, neighbour.into))
  if (!hit) return square
  const limit = Math.max(wall.thickness, neighbour.wall.thickness) * 6
  if (dist(hit, square) > limit) return square
  return hit
}

function offsetAt(frame: WallFrame, distance: number, signed: number): Vec2 {
  const s = sampleFrame(frame, distance)
  return add(s.point, scale(s.normal, signed))
}

/** Plan outline, mitred at joints shared (within 1 mm) with `neighbours`. */
export function wallPolygon(wall: Wall, neighbours: readonly Wall[]): Vec2[] {
  const frame = wallFrame(wall)
  if (frame.points.length < 2 || frame.length < 1e-6) return []
  const half = wall.thickness / 2
  const left: Vec2[] = []
  const right: Vec2[] = []
  for (let i = 0; i < frame.points.length; i++) {
    const d = frame.cum[i] ?? 0
    if (i === 0) {
      left.push(mitrePoint(wall, 'a', 1, neighbours))
      right.push(mitrePoint(wall, 'a', -1, neighbours))
    } else if (i === frame.points.length - 1) {
      left.push(mitrePoint(wall, 'b', 1, neighbours))
      right.push(mitrePoint(wall, 'b', -1, neighbours))
    } else {
      left.push(offsetAt(frame, d, half))
      right.push(offsetAt(frame, d, -half))
    }
  }
  right.reverse()
  return [...left, ...right]
}

export function findWallAt(level: Level, point: Vec2, tolerance: number): Wall | null {
  let best: Wall | null = null
  let bestD = Infinity
  for (const wall of level.walls) {
    const loc = locateOnWall(wall, point)
    const limit = wall.thickness / 2 + tolerance
    if (loc.distanceToWall <= limit && loc.distanceToWall < bestD) {
      best = wall
      bestD = loc.distanceToWall
    }
  }
  return best
}

export function connectedWalls(level: Level, point: Vec2, eps = JOIN_EPS): Wall[] {
  return level.walls.filter((w) => dist(w.a, point) <= eps || dist(w.b, point) <= eps)
}

export interface OpeningSpan {
  start: number
  end: number
  clamped: boolean
}

export function openingInterval(wall: Wall, opening: Opening): OpeningSpan {
  const length = wallLength(wall)
  const rawStart = opening.offset - opening.width / 2
  const rawEnd = opening.offset + opening.width / 2
  const start = Math.max(0, Math.min(length, rawStart))
  const end = Math.max(0, Math.min(length, rawEnd))
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    clamped: rawStart < -1e-6 || rawEnd > length + 1e-6,
  }
}

export function openingFits(wall: Wall, opening: Opening, others: readonly Opening[] = []): boolean {
  const length = wallLength(wall)
  if (opening.width <= 1e-4 || opening.height <= 1e-4) return false
  const start = opening.offset - opening.width / 2
  const end = opening.offset + opening.width / 2
  if (start < -1e-4 || end > length + 1e-4) return false
  if (opening.sill < -1e-4) return false
  if (opening.sill + opening.height > wall.height + 1e-4) return false
  for (const other of others) {
    if (other.id === opening.id || other.wallId !== wall.id) continue
    const a0 = other.offset - other.width / 2
    const a1 = other.offset + other.width / 2
    if (start < a1 - 1e-4 && end > a0 + 1e-4) return false
  }
  return true
}

function bulgeBetween(a: Vec2, b: Vec2, circle: ArcCircle): number {
  const angA = Math.atan2(a.y - circle.center.y, a.x - circle.center.x)
  const angB = Math.atan2(b.y - circle.center.y, b.x - circle.center.x)
  let sweep = angB - angA
  if (circle.sweep >= 0) {
    while (sweep < -1e-6) sweep += Math.PI * 2
    if (sweep > Math.abs(circle.sweep) + 0.05) sweep -= Math.PI * 2
  } else {
    while (sweep > 1e-6) sweep -= Math.PI * 2
    if (sweep < -Math.abs(circle.sweep) - 0.05) sweep += Math.PI * 2
  }
  const midAng = angA + sweep / 2
  const apex = {
    x: circle.center.x + Math.cos(midAng) * circle.radius,
    y: circle.center.y + Math.sin(midAng) * circle.radius,
  }
  const mid = lerp(a, b, 0.5)
  const dir = normalize(sub(b, a))
  if (len(dir) < 1e-8) return 0
  return dot(sub(apex, mid), perp(dir))
}

/**
 * Split `wallId` at a point on its centre-line. Openings whose centre lies past the cut move to
 * the new wall, every opening is clamped to fit its half, and one that cannot fit is removed.
 */
export function splitWall(level: Level, wallId: string, point: Vec2): { a: Wall; b: Wall } | null {
  const idx = level.walls.findIndex((w) => w.id === wallId)
  if (idx < 0) return null
  const wall = level.walls[idx]
  if (!wall) return null
  const loc = locateOnWall(wall, point)
  if (loc.distanceToWall > JOIN_EPS) return null
  if (loc.distance <= JOIN_EPS || loc.distance >= loc.length - JOIN_EPS) return null
  const at = { x: loc.point.x, y: loc.point.y }
  let bulge1 = 0
  let bulge2 = 0
  if (Math.abs(wall.bulge) > 1e-8) {
    const circle = arcCircle(wall.a, wall.b, wall.bulge)
    if (circle) {
      bulge1 = bulgeBetween(wall.a, at, circle)
      bulge2 = bulgeBetween(at, wall.b, circle)
    }
  }
  const kept: Wall = { ...wall, b: at, bulge: bulge1 }
  const spawned: Wall = {
    ...wall,
    id: newId('wall'),
    a: at,
    b: { x: wall.b.x, y: wall.b.y },
    bulge: bulge2,
    left: { ...wall.left },
    right: { ...wall.right },
  }
  const dropped = new Set<string>()
  for (const opening of level.openings) {
    if (opening.wallId !== wall.id) continue
    // The opening's centre decides its half; a cut exactly at the centre keeps it on `kept`.
    let target = kept
    if (opening.offset > loc.distance + JOIN_EPS) {
      opening.wallId = spawned.id
      opening.offset -= loc.distance
      target = spawned
    }
    const length = wallLength(target)
    if (length < opening.width + 2 * JOIN_EPS) {
      dropped.add(opening.id)
      continue
    }
    const half = opening.width / 2
    opening.offset = Math.min(Math.max(opening.offset, half), length - half)
  }
  for (let i = level.openings.length - 1; i >= 0; i--) {
    const opening = level.openings[i]
    if (opening && dropped.has(opening.id)) level.openings.splice(i, 1)
  }
  level.walls.splice(idx, 1, kept, spawned)
  return { a: kept, b: spawned }
}

export function pointAlongWall(wall: Wall, distance: number): Vec2 {
  return sampleFrame(wallFrame(wall), distance).point
}
