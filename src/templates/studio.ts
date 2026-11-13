import type { Project } from '../model/types'
import { addRailing, addSlab, cut, fresh, furnish, labelZones, shell, wall, zone } from './build'

/** About 35 m²: open living and kitchen, bathroom, entrance, balcony. */
export function studioApartment(): Project {
  const project = fresh('Studio', 'apartment')
  const level = project.levels[0]
  if (!level) return project
  level.name = 'Floor 2'
  level.elevation = 6
  shell(level, [
    { x: -3.5, y: -2.5 },
    { x: 3.5, y: -2.5 },
    { x: 3.5, y: 2.5 },
    { x: -3.5, y: 2.5 },
  ])
  wall(level, { x: -1.2, y: -2.5 }, { x: -1.2, y: -0.2 })
  wall(level, { x: -1.2, y: -0.2 }, { x: -3.5, y: -0.2 })
  wall(level, { x: 1.6, y: -2.5 }, { x: 1.6, y: -0.9 })
  wall(level, { x: 1.6, y: -0.9 }, { x: 3.5, y: -0.9 })
  cut(level, { x: 2.55, y: -2.5 }, 'door')
  cut(level, { x: 1.6, y: -1.7 }, 'door')
  cut(level, { x: -1.2, y: -1.35 }, 'door')
  cut(level, { x: 0.6, y: 2.5 }, 'sliding-door')
  cut(level, { x: -2.2, y: 2.5 }, 'window')
  addSlab(level, [
    { x: -1.2, y: 2.5 },
    { x: 2.8, y: 2.5 },
    { x: 2.8, y: 3.9 },
    { x: -1.2, y: 3.9 },
  ])
  addRailing(level, [
    { x: -1.12, y: 3.9 },
    { x: 2.72, y: 3.9 },
    { x: 2.72, y: 2.62 },
  ])
  addRailing(level, [
    { x: -1.12, y: 3.9 },
    { x: -1.12, y: 2.62 },
  ])
  labelZones(level, [
    zone('Bathroom', 'bathroom', -3.5, -2.5, -1.2, -0.2, 'tile-white'),
    zone('Entrance', 'hall', 1.6, -2.5, 3.5, -0.9, 'tile-hex'),
    zone('Living', 'living', -3.5, -2.5, 3.5, 2.5),
  ])
  furnish(level, 'sofa-3', -0.3, 0.85, Math.PI)
  furnish(level, 'coffee-table', -0.3, 0)
  furnish(level, 'kitchen-run', -2.55, 1.4, Math.PI / 2)
  furnish(level, 'dining-table', 1.4, 0.5)
  furnish(level, 'dining-chair', 1.4, -0.15)
  furnish(level, 'toilet', -2.9, -1.7)
  furnish(level, 'washbasin', -2.15, -2.15)
  furnish(level, 'plant-pot', 0.5, 1.7)
  return project
}
