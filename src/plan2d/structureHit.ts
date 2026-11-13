import { dist, pointInPolygon } from '../model/geometry'
import { buildRoofModel } from '../model/roofs'
import { stairHoleOutline } from '../model/stairs'
import type { Level, Vec2 } from '../model/types'
import { screenTol } from './snap'

/** Columns, stairs, slabs, then roofs. Walls and openings stay with the existing hit order. */
export function structureAt(level: Level, point: Vec2, zoom: number): string | null {
  const tol = screenTol(zoom, 8)
  for (let i = level.columns.length - 1; i >= 0; i--) {
    const column = level.columns[i]
    if (!column) continue
    if (dist(point, column.position) <= Math.max(0.15, column.size) / 2 + tol) return column.id
  }
  for (let i = level.stairs.length - 1; i >= 0; i--) {
    const stair = level.stairs[i]
    if (!stair) continue
    const hole = stairHoleOutline(stair)
    if (hole.length >= 3 && pointInPolygon(point, hole)) return stair.id
  }
  for (let i = level.slabs.length - 1; i >= 0; i--) {
    const slab = level.slabs[i]
    if (slab && slab.polygon.length >= 3 && pointInPolygon(point, slab.polygon)) return slab.id
  }
  for (let i = level.roofs.length - 1; i >= 0; i--) {
    const roof = level.roofs[i]
    if (!roof) continue
    const footprint = buildRoofModel(roof).footprint
    if (footprint.length >= 3 && pointInPolygon(point, footprint)) return roof.id
  }
  return null
}
