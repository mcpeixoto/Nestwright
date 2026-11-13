import type { Project } from '../model/types'
import { addStair, cut, fresh, furnish, labelZones, shell, wall, zone } from './build'

/** One building floor: three units, a shared corridor, and a stair core. */
export function apartmentFloor(): Project {
  const project = fresh('Apartment floor', 'apartment')
  const level = project.levels[0]
  if (!level) return project
  level.name = 'Floor 3'
  level.elevation = 9
  shell(level, [
    { x: -13.5, y: -5.2 },
    { x: 13.5, y: -5.2 },
    { x: 13.5, y: 6.2 },
    { x: -13.5, y: 6.2 },
  ])
  wall(level, { x: -13.5, y: -2.6 }, { x: 13.5, y: -2.6 })
  wall(level, { x: -4.5, y: -2.6 }, { x: -4.5, y: 6.2 })
  wall(level, { x: 4.5, y: -2.6 }, { x: 4.5, y: 6.2 })
  wall(level, { x: -1.6, y: -5.2 }, { x: -1.6, y: -2.6 })
  wall(level, { x: 1.6, y: -5.2 }, { x: 1.6, y: -2.6 })
  cut(level, { x: -9, y: -2.6 }, 'door')
  cut(level, { x: 0, y: -2.6 }, 'door')
  cut(level, { x: 9, y: -2.6 }, 'door')
  cut(level, { x: -8, y: -5.2 }, 'door')
  cut(level, { x: 8, y: -5.2 }, 'door')
  cut(level, { x: -9, y: 6.2 }, 'window')
  cut(level, { x: 0, y: 6.2 }, 'window')
  cut(level, { x: 9, y: 6.2 }, 'window')
  addStair(level, 0, -4.1, Math.PI / 2)
  labelZones(level, [
    zone('Unit A', 'living', -13.5, -2.6, -4.5, 6.2),
    zone('Unit B', 'living', -4.5, -2.6, 4.5, 6.2),
    zone('Unit C', 'living', 4.5, -2.6, 13.5, 6.2),
    zone('Stair', 'hall', -1.6, -5.2, 1.6, -2.6, 'concrete'),
    zone('Corridor', 'hall', -13.5, -5.2, 13.5, -2.6, 'tile-hex'),
  ])
  furnish(level, 'sofa-3', -9, 1.2, Math.PI)
  furnish(level, 'sofa-3', 0, 1.2, Math.PI)
  furnish(level, 'sofa-3', 9, 1.2, Math.PI)
  furnish(level, 'kitchen-run', -12.4, 3.5, Math.PI / 2)
  furnish(level, 'kitchen-run', -3.4, 3.5, Math.PI / 2)
  furnish(level, 'kitchen-run', 5.6, 3.5, Math.PI / 2)
  return project
}
