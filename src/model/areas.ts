import { cross, dist, lineIntersection, polygonArea } from './geometry'
import { detectRooms } from './rooms'
import type { Level, Project, Room, RoomType, Vec2 } from './types'
import { locateOnWall } from './walls'

/** Rooms that are outside the heated envelope: counted apart from the floor area. */
export const OUTDOOR_ROOMS: readonly RoomType[] = ['balcony', 'terrace']

/** A centre-line edge lies on a wall when both ends and the middle are this close to it. */
const ON_WALL = 0.005

/** Half the thickness of the wall a room edge runs along (0 when no wall matches). */
function edgeInset(level: Level, room: Room, a: Vec2, b: Vec2): number {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const ids = new Set(room.key.split(',').filter(Boolean))
  let best = 0
  let found = false
  for (const wall of level.walls) {
    if (ids.size > 0 && !ids.has(wall.id)) continue
    if (wall.kind === 'railing') continue
    const near = [a, mid, b].every((p) => locateOnWall(wall, p).distanceToWall <= ON_WALL)
    if (!near) continue
    // Two walls can overlap the same edge; the thicker one wins.
    if (!found || wall.thickness > best * 2) best = wall.thickness / 2
    found = true
  }
  return best
}

/**
 * The room's floor inside the wall faces: every centre-line edge is moved inward by
 * half the thickness of the wall it runs along, and the corners are re-met.
 */
export function roomNetPolygon(level: Level, room: Room): Vec2[] {
  const poly = room.polygon
  const n = poly.length
  if (n < 3) return []
  // Inward is to the left of travel on a counter-clockwise ring.
  const side = polygonArea(poly) >= 0 ? 1 : -1
  const lines: { a: Vec2; b: Vec2 }[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % n]!
    const length = dist(a, b)
    if (length < 1e-9) continue
    const inset = edgeInset(level, room, a, b)
    const nx = (-(b.y - a.y) / length) * side * inset
    const ny = ((b.x - a.x) / length) * side * inset
    lines.push({ a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } })
  }
  const m = lines.length
  if (m < 3) return []
  const out: Vec2[] = []
  for (let i = 0; i < m; i++) {
    const prev = lines[(i - 1 + m) % m]!
    const next = lines[i]!
    const d1 = { x: prev.b.x - prev.a.x, y: prev.b.y - prev.a.y }
    const d2 = { x: next.b.x - next.a.x, y: next.b.y - next.a.y }
    const turn = Math.abs(cross(d1, d2)) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y))
    const hit = turn > 1e-3 ? lineIntersection(prev.a, prev.b, next.a, next.b) : null
    // Nearly straight on (curved walls, collinear pieces): meet half way.
    out.push(hit ?? { x: (prev.b.x + next.a.x) / 2, y: (prev.b.y + next.a.y) / 2 })
  }
  return out
}

/** Net floor area in m²: inside the wall faces. Never more than the centre-line area. */
export function roomNetArea(level: Level, room: Room): number {
  const net = Math.abs(polygonArea(roomNetPolygon(level, room)))
  const gross = Math.abs(room.area)
  if (!Number.isFinite(net)) return 0
  return Math.min(net, gross)
}

export interface AreaTotals {
  /** Net floor area of indoor rooms, m². */
  net: number
  /** Centre-line area of indoor rooms, m². */
  gross: number
  /** Net area of balconies and terraces, m². */
  outdoor: number
  rooms: number
}

export function levelAreas(level: Level, rooms: readonly Room[] = detectRooms(level)): AreaTotals {
  const totals: AreaTotals = { net: 0, gross: 0, outdoor: 0, rooms: 0 }
  for (const room of rooms) {
    const net = roomNetArea(level, room)
    if (OUTDOOR_ROOMS.includes(room.type)) {
      totals.outdoor += net
      continue
    }
    totals.net += net
    totals.gross += Math.abs(room.area)
    totals.rooms += 1
  }
  return totals
}

export function projectAreas(
  project: Project,
  roomsOf: (level: Level) => readonly Room[] = detectRooms,
): AreaTotals {
  const totals: AreaTotals = { net: 0, gross: 0, outdoor: 0, rooms: 0 }
  for (const level of project.levels) {
    const part = levelAreas(level, roomsOf(level))
    totals.net += part.net
    totals.gross += part.gross
    totals.outdoor += part.outdoor
    totals.rooms += part.rooms
  }
  return totals
}
