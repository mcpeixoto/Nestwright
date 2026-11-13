import { dot, scale, sub } from './geometry'
import type { Level, Vec2 } from './types'
import { sampleFrame, wallFrame } from './walls'

const WINDOW = new Set(['window', 'fixed-window', 'tall-window', 'round-window', 'corner-window'])

export interface WindowSpill {
  /** Plan x, world x. */
  x: number
  /** Plan y, world z. */
  z: number
  /** World y of the lamp, just outside the glass. */
  y: number
}

function centroid(level: Level): Vec2 {
  let x = 0
  let y = 0
  let n = 0
  for (const wall of level.walls) {
    x += wall.a.x + wall.b.x
    y += wall.a.y + wall.b.y
    n += 2
  }
  if (n === 0) return { x: 0, y: 0 }
  return { x: x / n, y: y / n }
}

/**
 * One warm spill per ground-floor window, 0.45 m outside the wall
 * on the side that faces away from the building.
 */
export function exteriorWindowSpills(level: Level): WindowSpill[] {
  if (!level || level.elevation > 1.2) return []
  const center = centroid(level)
  const spills: WindowSpill[] = []
  for (const opening of level.openings) {
    if (!opening || !WINDOW.has(opening.type)) continue
    const wall = level.walls.find((item) => item.id === opening.wallId)
    if (!wall) continue
    const at = sampleFrame(wallFrame(wall), opening.offset)
    const inward = dot(at.normal, sub(center, at.point))
    const outside = inward >= 0 ? scale(at.normal, -1) : at.normal
    const pos = { x: at.point.x + outside.x * 0.45, y: at.point.y + outside.y * 0.45 }
    const drop = Math.min(opening.height * 0.42, 1.05)
    spills.push({
      x: pos.x,
      z: pos.y,
      y: level.elevation + opening.sill + drop,
    })
  }
  return spills
}
