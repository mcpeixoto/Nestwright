import { closestPointOnSegment, dist, lerp, pointInPolygon } from './geometry'
import { detectRooms } from './rooms'
import { computeStairSteps } from './stairs'
import type { Item, Level, Project, Vec2 } from './types'

export interface RoomCameraPose {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  roomName: string
  levelId: string
}

export interface RoomCameraOptions {
  /** Metres above the level floor. Defaults to 1.6. */
  eye?: number
}

/** How far inside the centre-line the eye sits, so a 0.2 m wall does not contain the camera. */
const EDGE_CLEAR = 0.45

function vertices(polygon: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const point of polygon) {
    const prev = out[out.length - 1]
    if (prev && dist(prev, point) < 1e-6) continue
    out.push(point)
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (first && last && out.length >= 2 && dist(first, last) < 1e-6) out.pop()
  return out
}

function edgeDistance(point: Vec2, polygon: readonly Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (!a || !b) continue
    const hit = closestPointOnSegment(point, a, b)
    const gap = dist(point, hit.point)
    if (gap < best) best = gap
  }
  return best
}

/** Signed distance to an item footprint. Negative means the point is inside the furniture. */
function itemClearance(item: Item, point: Vec2): number {
  const size = item.size
  if (!size || !(size.w > 0) || !(size.d > 0)) return Infinity
  const dx = point.x - item.position.x
  const dy = point.y - item.position.y
  const cos = Math.cos(item.rotation)
  const sin = Math.sin(item.rotation)
  const lx = dx * cos + dy * sin
  const ly = -dx * sin + dy * cos
  const ox = Math.abs(lx) - size.w / 2
  const oy = Math.abs(ly) - size.d / 2
  return Math.hypot(Math.max(ox, 0), Math.max(oy, 0)) + Math.min(Math.max(ox, oy), 0)
}

function nearestItem(level: Level, point: Vec2): number {
  let best = Infinity
  for (const item of level.items ?? []) {
    const gap = itemClearance(item, point)
    if (gap < best) best = gap
  }
  return best
}

/** Railing posts stand just outside the treads; treat this band around a stair as solid. */
const STAIR_MARGIN = 0.3
/** A stair farther than this along the sightline is background, not an obstruction. */
const STAIR_NEAR = 2.5

function gapToPolygon(point: Vec2, polygon: readonly Vec2[]): number {
  return pointInPolygon(point, polygon) ? 0 : edgeDistance(point, polygon)
}

/** Metres along eye → look before the sightline meets a stair (with railing margin); Infinity if never. */
function stairHitDistance(level: Level, eye: Vec2, look: Vec2): number {
  const stairs = level.stairs ?? []
  if (stairs.length === 0) return Infinity
  const treads = stairs.flatMap((stair) => computeStairSteps(stair, level.height).steps.map((step) => step.polygon))
  const length = dist(eye, look)
  if (length < 1e-4) return Infinity
  for (let travelled = 0; travelled <= length; travelled += 0.1) {
    const point = lerp(eye, look, travelled / length)
    if (treads.some((polygon) => gapToPolygon(point, polygon) < STAIR_MARGIN)) return travelled
  }
  return Infinity
}

interface Candidate {
  eye: Vec2
  look: Vec2 | null
  clear: number
}

/**
 * Prefer the corner whose view is not blocked by a nearby stair (its railing posts fill the frame);
 * otherwise the corner with more room around the eye.
 */
function pickEnd(level: Level, start: Candidate, end: Candidate): Candidate {
  const startHit = start.look ? stairHitDistance(level, start.eye, start.look) : Infinity
  const endHit = end.look ? stairHitDistance(level, end.eye, end.look) : Infinity
  const startBlocked = startHit < STAIR_NEAR
  const endBlocked = endHit < STAIR_NEAR
  if (startBlocked !== endBlocked) return startBlocked ? end : start
  if (startBlocked && endBlocked && Math.abs(startHit - endHit) > 1e-6) return endHit > startHit ? end : start
  return end.clear > start.clear + 1e-6 ? end : start
}

/** A look point just inside the far corner when that corner itself is blocked. */
function inwardLook(far: Vec2, eye: Vec2, polygon: readonly Vec2[], level: Level): Vec2 | null {
  const length = dist(far, eye)
  if (length < 1e-4) return null
  for (let travelled = 0.35; travelled <= length * 0.55; travelled += 0.1) {
    const point = lerp(far, eye, travelled / length)
    if (!pointInPolygon(point, polygon)) continue
    if (nearestItem(level, point) < 0) continue
    return point
  }
  return null
}

/** Smallest step along the diagonal that clears the walls and the furniture. */
function placeNear(from: Vec2, to: Vec2, polygon: readonly Vec2[], level: Level): Vec2 | null {
  const length = dist(from, to)
  if (length < 1e-4) return null
  let fallback: Vec2 | null = null
  let fallbackClear = -1
  const limit = Math.min(length * 0.42, 1.8)
  for (let travelled = 0.25; travelled <= limit + 1e-6; travelled += 0.05) {
    const point = lerp(from, to, travelled / length)
    if (!pointInPolygon(point, polygon)) continue
    if (nearestItem(level, point) < 0.2) continue
    const clear = edgeDistance(point, polygon)
    if (clear > fallbackClear) {
      fallback = point
      fallbackClear = clear
    }
    if (clear >= EDGE_CLEAR) return point
  }
  return fallback
}

function longestDiagonal(polygon: readonly Vec2[]): { from: Vec2; to: Vec2 } | null {
  const verts = vertices(polygon)
  let bestLen = -1
  let bestI = 0
  let bestJ = 1
  let found = false
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const a = verts[i]
      const b = verts[j]
      if (!a || !b) continue
      const length = dist(a, b)
      if (!pointInPolygon(lerp(a, b, 0.5), polygon)) continue
      const longer = length > bestLen + 1e-4
      const tie = Math.abs(length - bestLen) <= 1e-4 && (i < bestI || (i === bestI && j < bestJ))
      if (!found || longer || tie) {
        bestLen = length
        bestI = i
        bestJ = j
        found = true
      }
    }
  }
  const from = verts[bestI]
  const to = verts[bestJ]
  if (!found || !from || !to) return null
  return { from, to }
}

/**
 * Eye near one corner of the named room, looking along the longest diagonal
 * toward the opposite corner. Plan (x, y) maps to world (x, elevation, y).
 * When several rooms match the query, the largest area wins.
 */
export function roomCameraPose(
  project: Project,
  levelId: string,
  roomQuery: string,
  options?: RoomCameraOptions,
): RoomCameraPose | null {
  const level = project.levels.find((item) => item.id === levelId)
  const query = roomQuery.trim().toLowerCase()
  if (!level || !query) return null
  const matches = detectRooms(level).filter((room) => room.name.toLowerCase().includes(query))
  if (matches.length === 0) return null
  matches.sort((a, b) => b.area - a.area || a.name.localeCompare(b.name))
  const room = matches[0]
  if (!room) return null
  const diagonal = longestDiagonal(room.polygon)
  if (!diagonal) return null
  const nearStart = placeNear(diagonal.from, diagonal.to, room.polygon, level)
  const nearEnd = placeNear(diagonal.to, diagonal.from, room.polygon, level)
  const start = nearStart ? { eye: nearStart, look: nearEnd, clear: nearestItem(level, nearStart) } : null
  const end = nearEnd ? { eye: nearEnd, look: nearStart, clear: nearestItem(level, nearEnd) } : null
  const chosen = start && end ? pickEnd(level, start, end) : (start ?? end)
  if (!chosen) return null
  const eyePoint = chosen.eye
  const lookPoint =
    chosen.look ??
    inwardLook(chosen === start ? diagonal.to : diagonal.from, eyePoint, room.polygon, level)
  if (!lookPoint || dist(eyePoint, lookPoint) < 0.3) return null
  const requested = options?.eye
  const eye = typeof requested === 'number' && Number.isFinite(requested) && requested >= 0 ? requested : 1.6
  const y = level.elevation + eye
  return {
    position: { x: eyePoint.x, y, z: eyePoint.y },
    target: { x: lookPoint.x, y, z: lookPoint.y },
    roomName: room.name,
    levelId: level.id,
  }
}
