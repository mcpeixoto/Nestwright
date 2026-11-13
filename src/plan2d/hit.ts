import { dist } from '../model/geometry'
import { roomAt } from '../model/rooms'
import type { Level, Vec2 } from '../model/types'
import { findWallAt, locateOnWall, openingInterval } from '../model/walls'
import { pointInItem, screenTol } from './snap'

export function entityAt(level: Level, point: Vec2, zoom: number): string | null {
  const itemTol = screenTol(zoom, 4)
  for (let i = level.items.length - 1; i >= 0; i--) {
    const item = level.items[i]
    if (!item) continue
    if (pointInItem(point, item.position, item.size.w + itemTol, item.size.d + itemTol, item.rotation)) return item.id
  }
  for (const opening of level.openings) {
    const wall = level.walls.find((w) => w.id === opening.wallId)
    if (!wall) continue
    const loc = locateOnWall(wall, point)
    const span = openingInterval(wall, opening)
    if (loc.distanceToWall <= wall.thickness / 2 + 0.08 && loc.distance >= span.start && loc.distance <= span.end) {
      return opening.id
    }
  }
  const wall = findWallAt(level, point, 0.04)
  if (wall) return wall.id
  for (const dim of level.dimensions) {
    const dx = dim.b.x - dim.a.x
    const dy = dim.b.y - dim.a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * dim.offset
    const ny = (dx / len) * dim.offset
    const a = { x: dim.a.x + nx, y: dim.a.y + ny }
    const b = { x: dim.b.x + nx, y: dim.b.y + ny }
    const t = Math.min(1, Math.max(0, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (len * len)))
    const closest = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (dist(point, closest) < screenTol(zoom, 8)) return dim.id
  }
  return roomAt(level, point)?.key ?? null
}
