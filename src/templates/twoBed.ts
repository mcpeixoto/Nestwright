import type { Project } from '../model/types'
import { cut, fresh, furnish, labelZones, shell, wall, zone } from './build'

/** About 80 m², two bedrooms, two bathrooms, and a kitchen run. */
export function twoBedApartment(): Project {
  const project = fresh('Two-bedroom', 'apartment')
  const level = project.levels[0]
  if (!level) return project
  level.name = 'Floor 4'
  level.elevation = 12
  shell(level, [
    { x: -5, y: -4 },
    { x: 5, y: -4 },
    { x: 5, y: 4 },
    { x: -5, y: 4 },
  ])
  wall(level, { x: -5, y: 0.6 }, { x: 5, y: 0.6 })
  wall(level, { x: -1.4, y: 0.6 }, { x: -1.4, y: 4 })
  wall(level, { x: 1.6, y: 0.6 }, { x: 1.6, y: 4 })
  wall(level, { x: 2.4, y: -4 }, { x: 2.4, y: -1.5 })
  wall(level, { x: 2.4, y: -1.5 }, { x: 5, y: -1.5 })
  cut(level, { x: 0, y: -4 }, 'door')
  cut(level, { x: -3, y: 0.6 }, 'door')
  cut(level, { x: 0.1, y: 0.6 }, 'door')
  cut(level, { x: 3.2, y: 0.6 }, 'door')
  cut(level, { x: 2.4, y: -2.7 }, 'door')
  cut(level, { x: -3.2, y: 4 }, 'window')
  cut(level, { x: 3.4, y: 4 }, 'window')
  cut(level, { x: -2, y: -4 }, 'window')
  cut(level, { x: 4, y: -4 }, 'window')
  labelZones(level, [
    zone('Bedroom', 'bedroom', -5, 0.6, -1.4, 4),
    zone('Bathroom', 'bathroom', -1.4, 0.6, 1.6, 4, 'tile-white'),
    zone('Bedroom', 'bedroom', 1.6, 0.6, 5, 4),
    zone('Bathroom', 'bathroom', 2.4, -4, 5, -1.5, 'tile-white'),
    zone('Living', 'living', -5, -4, 5, 0.6),
  ])
  furnish(level, 'sofa-3', -1.2, -1.2, Math.PI)
  furnish(level, 'coffee-table', -1.2, -2.1)
  furnish(level, 'kitchen-run', -4.2, -2.4, Math.PI / 2)
  furnish(level, 'dining-table', 0.6, -2.6)
  furnish(level, 'dining-chair', 0.2, -3.2)
  furnish(level, 'dining-chair', 1.1, -3.2)
  furnish(level, 'bed-double', -3.2, 2.5, 0)
  furnish(level, 'nightstand', -4.4, 2.6)
  furnish(level, 'bed-double', 3.3, 2.5, 0)
  furnish(level, 'wardrobe', -4.4, 1.2)
  furnish(level, 'toilet', -0.8, 3.4)
  furnish(level, 'washbasin', 0.4, 3.5)
  furnish(level, 'shower', 0.9, 2.2)
  furnish(level, 'toilet', 4.2, -3.3)
  furnish(level, 'washbasin', 3.2, -3.5)
  furnish(level, 'bathtub', 4, -2.2)
  return project
}
