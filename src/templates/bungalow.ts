import type { Project } from '../model/types'
import { addRoof, addSlab, cut, fresh, furnish, garden, labelZones, shell, wall, zone } from './build'

/** Single storey, about 110 m², hip roof, garden, and a terrace. */
export function bungalow(): Project {
  const project = fresh('Bungalow', 'house', { width: 36, depth: 28 })
  const level = project.levels[0]
  if (!level) return project
  level.name = 'Ground'
  shell(level, [
    { x: -6, y: -4.6 },
    { x: 6, y: -4.6 },
    { x: 6, y: 4.6 },
    { x: -6, y: 4.6 },
  ])
  wall(level, { x: -6, y: 0 }, { x: 6, y: 0 })
  wall(level, { x: -1.5, y: 0 }, { x: -1.5, y: 4.6 })
  wall(level, { x: 2.2, y: 0 }, { x: 2.2, y: 4.6 })
  wall(level, { x: -2.2, y: -4.6 }, { x: -2.2, y: 0 })
  cut(level, { x: 1.5, y: -4.6 }, 'door')
  cut(level, { x: -4, y: 0 }, 'door')
  cut(level, { x: 0.4, y: 0 }, 'door')
  cut(level, { x: 4, y: 0 }, 'door')
  cut(level, { x: -4, y: -4.6 }, 'window')
  cut(level, { x: 4, y: -4.6 }, 'sliding-door')
  cut(level, { x: -4, y: 4.6 }, 'window')
  cut(level, { x: 4, y: 4.6 }, 'window')
  addRoof(level, 'hip', Math.PI / 6)
  addSlab(level, [
    { x: -1, y: -4.6 },
    { x: 5.2, y: -4.6 },
    { x: 5.2, y: -6.5 },
    { x: -1, y: -6.5 },
  ])
  labelZones(level, [
    zone('Kitchen', 'kitchen', -6, -4.6, -2.2, 0, 'tile-white'),
    zone('Bedroom', 'bedroom', -6, 0, -1.5, 4.6),
    zone('Bathroom', 'bathroom', -1.5, 0, 2.2, 4.6, 'tile-white'),
    zone('Bedroom', 'bedroom', 2.2, 0, 6, 4.6),
    zone('Living', 'living', -2.2, -4.6, 6, 0),
  ])
  furnish(level, 'sofa-3', 1.6, -2.2, Math.PI)
  furnish(level, 'coffee-table', 1.6, -3.1)
  furnish(level, 'kitchen-run', -5.1, -2.4, Math.PI / 2)
  furnish(level, 'dining-table', -3.6, -2.2)
  furnish(level, 'bed-double', -3.8, 2.6)
  furnish(level, 'bed-double', 4.1, 2.6)
  furnish(level, 'toilet', -0.6, 3.8)
  furnish(level, 'washbasin', 0.6, 4)
  furnish(level, 'bathtub', 1.2, 2.4)
  garden(project, 11)
  return project
}
