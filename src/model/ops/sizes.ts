import { add, scale, sub } from '../geometry'
import type { Level, Opening, Wall } from '../types'
import { openingFits, wallLength } from '../walls'
import { moveWallEndpoint } from './index'

/** Shortest wall a typed length may produce. */
export const MIN_WALL_LENGTH = 0.1

function onWall(level: Level, wall: Wall): Opening[] {
  return level.openings.filter((opening) => opening.wallId === wall.id)
}

/**
 * Resize a wall along its own direction. The `keep` end stays put; the other end
 * moves and every wall joined there follows. A curved wall keeps its shape (the
 * bulge scales with the chord). Openings keep their distance from the fixed end
 * and are pulled back inside a wall that got too short for them.
 */
export function setWallLength(level: Level, wallId: string, length: number, keep: 'a' | 'b' = 'a'): boolean {
  const wall = level.walls.find((item) => item.id === wallId)
  if (!wall || !Number.isFinite(length) || length < MIN_WALL_LENGTH) return false
  const current = wallLength(wall)
  if (current < 1e-6) return false
  const ratio = length / current
  if (Math.abs(ratio - 1) < 1e-9) return true
  const moving = keep === 'a' ? 'b' : 'a'
  const fixed = { x: wall[keep].x, y: wall[keep].y }
  const target = add(fixed, scale(sub(wall[moving], fixed), ratio))
  const bulge = wall.bulge * ratio
  const gaps = onWall(level, wall).map((opening) => ({
    opening,
    gap: keep === 'a' ? opening.offset : current - opening.offset,
  }))
  moveWallEndpoint(level, wallId, moving, target)
  wall.bulge = bulge
  const next = wallLength(wall)
  for (const { opening, gap } of gaps) {
    const offset = keep === 'a' ? gap : next - gap
    const half = opening.width / 2
    opening.offset = Math.min(Math.max(half, next - half), Math.max(half, offset))
  }
  return true
}

/** Clear distance from wall end `side` to the near edge of the opening. */
export function openingGap(wall: Wall, opening: Opening, side: 'a' | 'b'): number {
  const length = wallLength(wall)
  return side === 'a' ? opening.offset - opening.width / 2 : length - opening.offset - opening.width / 2
}

/**
 * Place an opening so its near edge sits `gap` metres from wall end `side`.
 * Refuses (returns false, nothing changes) when the opening would leave the wall
 * or overlap another opening.
 */
export function setOpeningGap(level: Level, openingId: string, side: 'a' | 'b', gap: number): boolean {
  const opening = level.openings.find((item) => item.id === openingId)
  const wall = opening ? level.walls.find((item) => item.id === opening.wallId) : undefined
  if (!opening || !wall || !Number.isFinite(gap) || gap < 0) return false
  const length = wallLength(wall)
  const offset = side === 'a' ? gap + opening.width / 2 : length - gap - opening.width / 2
  return setOpeningOffset(level, openingId, offset)
}

/** Move an opening's centre to `offset` along its wall, if it still fits there. */
export function setOpeningOffset(level: Level, openingId: string, offset: number): boolean {
  const opening = level.openings.find((item) => item.id === openingId)
  const wall = opening ? level.walls.find((item) => item.id === opening.wallId) : undefined
  if (!opening || !wall || !Number.isFinite(offset)) return false
  const moved: Opening = { ...opening, offset }
  if (!openingFits(wall, moved, onWall(level, wall))) return false
  opening.offset = offset
  return true
}

/**
 * Slide an opening toward `offset` along its wall, clamped to the wall ends and
 * stopping against neighbouring openings. Used while dragging.
 */
export function slideOpening(level: Level, openingId: string, offset: number): boolean {
  const opening = level.openings.find((item) => item.id === openingId)
  const wall = opening ? level.walls.find((item) => item.id === opening.wallId) : undefined
  if (!opening || !wall || !Number.isFinite(offset)) return false
  const half = opening.width / 2
  const length = wallLength(wall)
  if (length < opening.width) return false
  let lo = half
  let hi = length - half
  for (const other of onWall(level, wall)) {
    if (other.id === opening.id) continue
    const otherHalf = other.width / 2
    if (other.offset <= opening.offset) lo = Math.max(lo, other.offset + otherHalf + half)
    else hi = Math.min(hi, other.offset - otherHalf - half)
  }
  if (hi < lo) return false
  const next = Math.min(hi, Math.max(lo, offset))
  if (Math.abs(next - opening.offset) < 1e-9) return false
  opening.offset = next
  return true
}
