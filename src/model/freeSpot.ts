import { convexPenetration, isFlatItem, itemFootprint } from './clearance'
import { pointInPolygon } from './geometry'
import { detectRooms } from './rooms'
import type { Level, Room, Vec2 } from './types'

/** Gap kept from walls and other furniture, in metres. */
const MARGIN = 0.1
/** Candidate spacing inside the room, in metres. */
const STEP = 0.1

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function roomFor(rooms: readonly Room[], target: Vec2): Room | null {
  const inside = rooms.find((room) => pointInPolygon(target, room.polygon))
  if (inside) return inside
  let best: Room | null = null
  for (const room of rooms) if (!best || room.area > best.area) best = room
  return best
}

/**
 * Plan rotation (a multiple of 90°) that turns an item's front, local +y, towards `toward`.
 * Plan rotation is CCW, so local (0, 1) ends up at (-sin r, cos r).
 */
export function facingRotation(from: Vec2, toward: Vec2): number {
  const fx = toward.x - from.x
  const fy = toward.y - from.y
  if (Math.hypot(fx, fy) < 1e-6) return 0
  const quarter = Math.round(Math.atan2(-fx, fy) / (Math.PI / 2))
  return (((quarter % 4) + 4) % 4) * (Math.PI / 2)
}

export interface Placement {
  position: Vec2
  rotation: number
}

/**
 * Where to drop a new item of `size` so it does not sit on a wall or on other furniture: the
 * free point nearest `target` inside the room under `target` (or the largest room when
 * `target` is outside every room), turned in 90° steps so its front faces the room's middle.
 * Rugs and other flat items do not block. Returns `target` at rotation 0 when the level has no
 * room or no free point fits.
 */
export function freeSpot(level: Level, target: Vec2, size: { w: number; d: number }): Placement {
  const room = roomFor(detectRooms(level), target)
  if (!room) return { position: target, rotation: 0 }
  const start = pointInPolygon(target, room.polygon) ? target : room.centroid
  const rotation = facingRotation(start, room.centroid)
  // A quarter turn swaps the footprint's sides on the plan.
  const sideways = Math.round(rotation / (Math.PI / 2)) % 2 === 1
  const hw = (sideways ? size.d : size.w) / 2
  const hd = (sideways ? size.w : size.d) / 2
  const corners = (p: Vec2): Vec2[] => [
    { x: p.x - hw - MARGIN, y: p.y - hd - MARGIN },
    { x: p.x + hw + MARGIN, y: p.y - hd - MARGIN },
    { x: p.x + hw + MARGIN, y: p.y + hd + MARGIN },
    { x: p.x - hw - MARGIN, y: p.y + hd + MARGIN },
  ]
  const blockers = level.items.filter((item) => !isFlatItem(item)).map((item) => itemFootprint(item))
  const wallHalf = new Map(level.walls.map((wall) => [wall.id, (wall.thickness > 0 ? wall.thickness : 0.2) / 2]))

  const fits = (p: Vec2): boolean => {
    const box = corners(p)
    if (!box.every((corner) => pointInPolygon(corner, room.polygon))) return false
    for (const wall of level.walls) {
      const clear = (wallHalf.get(wall.id) ?? 0.1) + MARGIN
      // Box-to-segment test via the box's edges and the wall's ends.
      for (let i = 0; i < 4; i++) {
        const a = box[i]!
        const b = box[(i + 1) % 4]!
        if (segmentDistance(a, wall.a, wall.b) < clear - MARGIN) return false
        if (segmentDistance(wall.a, a, b) < clear - MARGIN || segmentDistance(wall.b, a, b) < clear - MARGIN) return false
      }
    }
    return blockers.every((other) => convexPenetration(box, other) <= 0)
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of room.polygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const goal = start
  let best: Vec2 | null = null
  let bestDistance = Infinity
  for (let x = minX + hw; x <= maxX - hw + 1e-9; x += STEP) {
    for (let y = minY + hd; y <= maxY - hd + 1e-9; y += STEP) {
      const p = { x, y }
      const distance = Math.hypot(x - goal.x, y - goal.y)
      if (distance >= bestDistance || !fits(p)) continue
      best = p
      bestDistance = distance
    }
  }
  return best ? { position: best, rotation } : { position: target, rotation: 0 }
}
