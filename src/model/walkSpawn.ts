import { add, dist, pointInPolygon, scale } from './geometry'
import { detectRooms } from './rooms'
import type { Level, Opening, Project, Room, Vec2 } from './types'
import { sampleFrame, wallFrame } from './walls'

const EYE = 1.65
const OUTSIDE = 2
const DOORS: ReadonlySet<string> = new Set(['door', 'double-door', 'sliding-door'])

export interface WalkSpawn {
  /** World x (plan x). */
  x: number
  /** World y, eye height. */
  y: number
  /** World z (plan y). */
  z: number
  /** Camera yaw. Zero looks toward -Z. */
  yaw: number
}

function roomsOf(level: Level): Room[] {
  try {
    if (!Array.isArray(level.walls) || level.walls.length < 3) return []
    return detectRooms(level)
  } catch {
    return []
  }
}

function inside(level: Level, point: Vec2): boolean {
  return roomsOf(level).some((room) => pointInPolygon(point, room.polygon))
}

/** Wall normal that points out of the building. */
function exteriorNormal(level: Level, point: Vec2, normal: Vec2): Vec2 {
  const left = add(point, scale(normal, 0.55))
  const right = add(point, scale(normal, -0.55))
  const leftIn = inside(level, left)
  const rightIn = inside(level, right)
  if (leftIn && !rightIn) return scale(normal, -1)
  if (rightIn && !leftIn) return { x: normal.x, y: normal.y }
  const rooms = roomsOf(level)
  let cx = point.x
  let cy = point.y
  if (rooms.length > 0) {
    cx = 0
    cy = 0
    for (const room of rooms) {
      cx += room.centroid.x
      cy += room.centroid.y
    }
    cx /= rooms.length
    cy /= rooms.length
  }
  const centroid = { x: cx, y: cy }
  return dist(left, centroid) >= dist(right, centroid) ? { x: normal.x, y: normal.y } : scale(normal, -1)
}

/** Yaw so the camera looks along a plan vector (x, y) → world (x, z). */
function yawToward(dir: Vec2): number {
  return Math.atan2(dir.x, -dir.y)
}

function longestAxis(polygon: readonly Vec2[]): Vec2 {
  let best = 0
  let axis: Vec2 = { x: 1, y: 0 }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length > best) {
      best = length
      axis = { x: dx / length, y: dy / length }
    }
  }
  return axis
}

function outsideDoor(level: Level, opening: Opening): { x: number; z: number; yaw: number } | null {
  const wall = level.walls.find((item) => item.id === opening.wallId)
  if (!wall) return null
  let sample
  try {
    sample = sampleFrame(wallFrame(wall), opening.offset)
  } catch {
    return null
  }
  if (!Number.isFinite(sample.point.x) || !Number.isFinite(sample.point.y)) return null
  const outward = exteriorNormal(level, sample.point, sample.normal)
  const pos = add(sample.point, scale(outward, OUTSIDE))
  return { x: pos.x, z: pos.y, yaw: yawToward(scale(outward, -1)) }
}

/**
 * Where walk mode should start: just outside the first ground-floor door,
 * facing it, or the centroid of the largest room when there is no door.
 */
export function walkSpawn(project: Project): WalkSpawn {
  const fallback: WalkSpawn = { x: 0, y: EYE, z: 2, yaw: Math.PI }
  const levels = Array.isArray(project?.levels) ? project.levels.filter((level) => level && typeof level === 'object') : []
  if (levels.length === 0) return fallback
  const ordered = [...levels].sort((a, b) => (a.elevation || 0) - (b.elevation || 0))
  const doorLevel = ordered.find((level) => (level.openings ?? []).some((opening) => DOORS.has(opening.type)))
  if (doorLevel) {
    const opening = (doorLevel.openings ?? []).find((item) => DOORS.has(item.type))
    const placed = opening ? outsideDoor(doorLevel, opening) : null
    if (placed) {
      return { x: placed.x, y: (doorLevel.elevation || 0) + EYE, z: placed.z, yaw: placed.yaw }
    }
  }
  const roomLevel = ordered.find((level) => roomsOf(level).length > 0) ?? ordered[0]
  if (!roomLevel) return fallback
  const rooms = roomsOf(roomLevel)
  if (rooms.length === 0) return { x: 0, y: (roomLevel.elevation || 0) + EYE, z: 2, yaw: Math.PI }
  let largest = rooms[0]!
  for (const room of rooms) {
    if ((room.area || 0) > (largest.area || 0)) largest = room
  }
  const axis = longestAxis(largest.polygon ?? [])
  const centroid = largest.centroid ?? { x: 0, y: 0 }
  return {
    x: centroid.x,
    y: (roomLevel.elevation || 0) + EYE,
    z: centroid.y,
    yaw: yawToward(axis),
  }
}
