import { detectRooms } from './rooms'
import type { Level, Project } from './types'

function roomCount(level: Level): number {
  try {
    if (!Array.isArray(level.walls)) return 0
    return detectRooms(level).length
  } catch {
    return 0
  }
}

/** Ground floor, or the lowest storey that actually contains rooms. */
export function levelToOpen(project: Project): string {
  const levels = Array.isArray(project?.levels) ? project.levels.filter((level) => level && typeof level.id === 'string') : []
  if (levels.length === 0) return ''
  const withRooms = levels.filter((level) => roomCount(level) > 0)
  const pool = withRooms.length > 0 ? withRooms : levels
  let best = pool[0]
  if (!best) return ''
  for (const level of pool) {
    if (level.elevation < best.elevation - 1e-6) best = level
    else if (Math.abs(level.elevation - best.elevation) <= 1e-6 && level.walls.length > best.walls.length) best = level
  }
  return best.id
}
