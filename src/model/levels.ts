import { createLevel, createWall } from './defaults'
import type { Level, Wall } from './types'

function byElevation(a: Level, b: Level): number {
  return a.elevation - b.elevation
}

/**
 * Insert a storey against `activeId`.
 * Above: the new floor sits at active.elevation + active.height, and anything already
 * there (or higher) moves up by one storey.
 * Below: the new floor takes the active elevation, and the active floor and everything
 * above it move up, so each upper elevation stays previous + height.
 */
export function insertLevel(levels: Level[], activeId: string, where: 'above' | 'below'): Level | null {
  const base = levels.find((level) => level.id === activeId)
  if (!base) return null
  const height = base.height
  const elevation = where === 'above' ? base.elevation + height : base.elevation
  const threshold = where === 'above' ? elevation : base.elevation
  for (const level of levels) {
    if (level.elevation >= threshold - 1e-6) level.elevation += height
  }
  const next = createLevel(`Level ${levels.length + 1}`, elevation)
  next.height = height
  next.slabThickness = base.slabThickness
  levels.push(next)
  levels.sort(byElevation)
  return next
}

/** A new level just above `sourceId`, with copies of its walls and fresh ids. */
export function duplicateLevel(levels: Level[], sourceId: string): Level | null {
  const source = levels.find((level) => level.id === sourceId)
  if (!source) return null
  const walls = source.walls.map((wall) => copyWall(wall))
  const created = insertLevel(levels, sourceId, 'above')
  if (!created) return null
  created.name = `${source.name} copy`
  created.height = source.height
  created.slabThickness = source.slabThickness
  created.walls = walls
  return created
}

/** Refuses to remove the last storey. Returns false when nothing changed. */
export function removeLevel(levels: Level[], levelId: string): boolean {
  if (levels.length <= 1) return false
  const index = levels.findIndex((level) => level.id === levelId)
  if (index < 0) return false
  levels.splice(index, 1)
  return true
}

function copyWall(wall: Wall): Wall {
  return createWall(wall.a, wall.b, {
    thickness: wall.thickness,
    height: wall.height,
    bulge: wall.bulge,
    left: { ...wall.left },
    right: { ...wall.right },
    kind: wall.kind,
  })
}
