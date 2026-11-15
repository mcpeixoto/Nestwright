import { add, pointInPolygon, scale } from './geometry'
import { detectRooms } from './rooms'
import type { CeilingTrim, Level, LevelTrim, Opening, Room, Wall } from './types'
import { sampleFrame, wallFrame } from './walls'

/** Interior trim of a level with the defaults filled in: skirting on, a 10 mm shadow gap. */
export interface ResolvedTrim {
  skirting: boolean
  ceiling: CeilingTrim
}

export const DEFAULT_TRIM: ResolvedTrim = { skirting: true, ceiling: 'shadow-gap' }

export function resolveTrim(trim: LevelTrim | undefined): ResolvedTrim {
  return {
    skirting: trim?.skirting ?? DEFAULT_TRIM.skirting,
    ceiling: trim?.ceiling ?? DEFAULT_TRIM.ceiling,
  }
}

/** Skirting boards: 80 mm tall, 12 mm proud. */
export const SKIRTING = { height: 0.08, depth: 0.012 } as const

/** Openings whose sill is lower than this cut the skirting (doors, floor-length glazing). */
export function cutsSkirting(opening: Opening): boolean {
  return opening.sill < SKIRTING.height + 0.01
}

const roomCache = new WeakMap<Level, Room[]>()

/** Rooms of a level, memoized on its identity (levels are immutable outside drafts). */
export function levelRooms(level: Level): Room[] {
  const cached = roomCache.get(level)
  if (cached) return cached
  const rooms = detectRooms(level)
  roomCache.set(level, rooms)
  return rooms
}

/**
 * The room on one side of a wall at `distance` along it, or null when that side faces outdoors.
 * `side` +1 is left of a→b. Room polygons run on wall centre-lines, so the probe sits just past
 * the face.
 */
export function roomBeside(wall: Wall, side: 1 | -1, distance: number, rooms: readonly Room[]): Room | null {
  const at = sampleFrame(wallFrame(wall), distance)
  const probe = add(at.point, scale(at.normal, side * (wall.thickness / 2 + 0.05)))
  for (const room of rooms) {
    if (pointInPolygon(probe, room.polygon)) return room
  }
  return null
}

export type OpeningFamily = 'door' | 'window' | 'other'

export function openingFamily(opening: Opening): OpeningFamily {
  switch (opening.type) {
    case 'door':
    case 'double-door':
    case 'sliding-door':
      return 'door'
    case 'window':
    case 'fixed-window':
    case 'tall-window':
    case 'corner-window':
      return 'window'
    default:
      return 'other'
  }
}

/** Where an opening's trim goes. Sides are +1 (left of a→b) and -1. */
export interface OpeningTrim {
  /** Faces that get an architrave. */
  casing: { left: boolean; right: boolean }
  /** Window stool on the room side and sill with a drip outside; 0 when there is none. */
  interior: 1 | -1 | 0
}

export function openingTrim(opening: Opening, wall: Wall, rooms: readonly Room[]): OpeningTrim {
  const family = openingFamily(opening)
  const left = roomBeside(wall, 1, opening.offset, rooms) !== null
  const right = roomBeside(wall, -1, opening.offset, rooms) !== null
  if (family === 'other') return { casing: { left: false, right: false }, interior: 0 }
  if (opening.type === 'door' || opening.type === 'double-door') {
    // Hinged doors are cased on both faces, the front door too.
    return { casing: { left: true, right: true }, interior: left === right ? 0 : left ? 1 : -1 }
  }
  // Sliding doors and windows: cased on the room side only.
  return { casing: { left, right }, interior: left === right ? 0 : left ? 1 : -1 }
}
