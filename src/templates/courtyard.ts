import type { Project } from '../model/types'
import { addRoof, addTree, cut, fresh, furnish, garden, labelZones, shell, wall, zone } from './build'

/** U-shaped rooms around an open patio with a tree, under a flat roof. */
export function courtyardHouse(): Project {
  const project = fresh('Courtyard house', 'house', { width: 36, depth: 32 })
  const level = project.levels[0]
  if (!level) return project
  level.name = 'Ground'
  const shellRing = [
    { x: -7, y: -6 },
    { x: -3, y: -6 },
    { x: -3, y: 2 },
    { x: 3, y: 2 },
    { x: 3, y: -6 },
    { x: 7, y: -6 },
    { x: 7, y: 6 },
    { x: -7, y: 6 },
  ]
  shell(level, shellRing)
  wall(level, { x: -7, y: 2 }, { x: -3, y: 2 })
  wall(level, { x: 3, y: 2 }, { x: 7, y: 2 })
  wall(level, { x: 5, y: 2 }, { x: 5, y: 6 })
  cut(level, { x: -5, y: -6 }, 'door')
  cut(level, { x: 5, y: -6 }, 'door')
  cut(level, { x: -5, y: 2 }, 'door')
  cut(level, { x: 4, y: 2 }, 'sliding-door')
  cut(level, { x: 6, y: 2 }, 'door')
  cut(level, { x: 0, y: 6 }, 'window')
  cut(level, { x: -7, y: 4 }, 'window')
  cut(level, { x: 7, y: -2 }, 'window')
  addRoof(level, 'flat')
  const roof = level.roofs[level.roofs.length - 1]
  if (roof) roof.outline = shellRing.map((point) => ({ x: point.x, y: point.y }))
  labelZones(level, [
    zone('Bedroom', 'bedroom', -7, -6, -3, 2),
    zone('Kitchen', 'kitchen', 3, -6, 7, 2, 'tile-white'),
    zone('Bathroom', 'bathroom', 5, 2, 7, 6, 'tile-white'),
    zone('Living', 'living', -7, 2, 5, 6),
  ])
  furnish(level, 'sofa-3', -2, 4, Math.PI)
  furnish(level, 'coffee-table', -2, 3.1)
  furnish(level, 'bed-double', -5, -2)
  furnish(level, 'kitchen-run', 6.1, -2, -Math.PI / 2)
  furnish(level, 'dining-table', 4.6, -3.4)
  furnish(level, 'toilet', 6.2, 5.2)
  furnish(level, 'washbasin', 5.6, 4.2)
  garden(project, 9)
  addTree(project, 0, -3.4, 'olive')
  return project
}
