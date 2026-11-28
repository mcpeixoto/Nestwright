import { pointInPolygon } from './geometry'
import { detectRooms } from './rooms'
import { stairHoleOutline, stairRampHeightAt } from './stairs'
import type { Item, Level, Project, Room } from './types'

export const WALK_RADIUS = 0.3
export const WALK_HEIGHT = 1.7
/** Depth of a flight's stringer below its walking surface. */
const STRINGER = 0.25

type RoomsOf = (level: Level) => readonly Room[]

function insideItem(item: Item, x: number, y: number): boolean {
  const dx = x - item.position.x
  const dy = y - item.position.y
  const c = Math.cos(item.rotation)
  const s = Math.sin(item.rotation)
  const lx = dx * c + dy * s
  const ly = -dx * s + dy * c
  return Math.abs(lx) <= item.size.w / 2 && Math.abs(ly) <= item.size.d / 2
}

function inStairHole(project: Project, upper: Level, x: number, y: number): boolean {
  const point = { x, y }
  for (const level of project.levels) {
    if (level.elevation >= upper.elevation - 1e-3) continue
    for (const stair of level.stairs) {
      const hole = stairHoleOutline(stair)
      if (hole.length >= 3 && pointInPolygon(point, hole)) return true
    }
  }
  return false
}

/** Lowest solid surface above `feetY` at (x, y), or null when the sky is open. */
export function ceilingAt(
  project: Project,
  levelId: string,
  x: number,
  y: number,
  feetY: number,
  roomsOf: RoomsOf = detectRooms,
): number | null {
  const point = { x, y }
  let best = Infinity
  for (const level of project.levels) {
    if (level.id !== levelId && level.elevation > feetY + 0.05) {
      const floor = level.elevation - level.slabThickness
      if (floor < best && roomsOf(level).some((room) => pointInPolygon(point, room.polygon))) {
        if (!inStairHole(project, level, x, y)) best = floor
      }
    }
    for (const stair of level.stairs) {
      const height = stairRampHeightAt(stair, level, x, y)
      if (height == null) continue
      const under = height - STRINGER
      if (under > feetY && under < best) best = under
    }
    for (const item of level.items) {
      const bottom = level.elevation + item.elevation
      if (bottom > feetY + 0.4 && bottom < best && insideItem(item, x, y)) best = bottom
    }
  }
  return Number.isFinite(best) ? best : null
}

export function headroomBlocked(
  project: Project,
  levelId: string,
  x: number,
  y: number,
  feetY: number,
  height = WALK_HEIGHT,
  roomsOf: RoomsOf = detectRooms,
): boolean {
  const ceiling = ceilingAt(project, levelId, x, y, feetY, roomsOf)
  return ceiling != null && ceiling < feetY + height
}
