import { newId } from '../model/ids'
import { mat } from '../model/defaults'
import type { Project } from '../model/types'
import { addPool, addRoof, addStair, cut, fresh, furnish, garden, labelZones, shell, upperStorey, wall, zone } from './build'

/** Two storeys, about 180 m², straight stair, gable roof, garage, garden, and a pool. */
export function familyHouse(): Project {
  const project = fresh('Family house', 'house', { width: 40, depth: 32 })
  const ground = project.levels[0]
  if (!ground) return project
  ground.name = 'Ground'
  shell(ground, [
    { x: -6.6, y: -4.1 },
    { x: 6.6, y: -4.1 },
    { x: 6.6, y: 4.1 },
    { x: -6.6, y: 4.1 },
  ])
  wall(ground, { x: -2.8, y: -4.1 }, { x: -2.8, y: 0.4 })
  wall(ground, { x: -6.6, y: 0.4 }, { x: 6.6, y: 0.4 })
  wall(ground, { x: 2.4, y: 0.4 }, { x: 2.4, y: 4.1 })
  cut(ground, { x: -4.7, y: -4.1 }, 'garage-door')
  cut(ground, { x: 1.2, y: -4.1 }, 'door')
  cut(ground, { x: -2.8, y: -1.6 }, 'door')
  cut(ground, { x: -1, y: 0.4 }, 'door')
  cut(ground, { x: 4.4, y: 0.4 }, 'door')
  cut(ground, { x: 4, y: -4.1 }, 'window')
  cut(ground, { x: 5.4, y: 4.1 }, 'window')
  cut(ground, { x: -5.4, y: 4.1 }, 'window')
  addStair(ground, 0.2, 2.2, Math.PI / 2)
  ground.roofs.push({
    id: newId('roof'),
    shape: 'flat',
    outline: [
      { x: -6.6, y: -4.1 },
      { x: -2.8, y: -4.1 },
      { x: -2.8, y: 0.4 },
      { x: -6.6, y: 0.4 },
    ],
    pitch: 0.02,
    overhang: 0.2,
    ridgeAngle: 0,
    thickness: 0.08,
    material: mat('roof-metal'),
    cutouts: [],
  })
  labelZones(ground, [
    zone('Garage', 'garage', -6.6, -4.1, -2.8, 0.4, 'concrete'),
    zone('Bathroom', 'wc', 2.4, 0.4, 6.6, 4.1, 'tile-white'),
    zone('Living', 'living', -2.8, -4.1, 6.6, 0.4),
    zone('Kitchen', 'kitchen', -6.6, 0.4, 2.4, 4.1, 'tile-white'),
  ])
  furnish(ground, 'sofa-3', 1.5, -1.8, Math.PI)
  furnish(ground, 'coffee-table', 1.5, -2.7)
  furnish(ground, 'kitchen-run', -5.6, 2.6, Math.PI / 2)
  furnish(ground, 'dining-table', -4.2, 2.2)
  furnish(ground, 'dining-chair', -4.6, 1.4)
  furnish(ground, 'toilet', 5.4, 3.4)
  furnish(ground, 'washbasin', 3.4, 3.5)
  furnish(ground, 'car', -4.6, -2.2)

  const upper = upperStorey(project, 'Upper', ground.height)
  shell(upper, [
    { x: -3.4, y: -3.2 },
    { x: 6.6, y: -3.2 },
    { x: 6.6, y: 4 },
    { x: -3.4, y: 4 },
  ])
  wall(upper, { x: -3.4, y: 0.6 }, { x: 6.6, y: 0.6 })
  wall(upper, { x: 0.2, y: 0.6 }, { x: 0.2, y: 4 })
  wall(upper, { x: 3.4, y: 0.6 }, { x: 3.4, y: 4 })
  cut(upper, { x: -1.6, y: 0.6 }, 'door')
  cut(upper, { x: 1.8, y: 0.6 }, 'door')
  cut(upper, { x: 5, y: 0.6 }, 'door')
  cut(upper, { x: -1.6, y: 4 }, 'window')
  cut(upper, { x: 1.8, y: 4 }, 'window')
  cut(upper, { x: 5, y: -3.2 }, 'window')
  addRoof(upper, 'gable', Math.PI / 6)
  labelZones(upper, [
    zone('Bedroom', 'bedroom', -3.4, 0.6, 0.2, 4),
    zone('Bathroom', 'bathroom', 0.2, 0.6, 3.4, 4, 'tile-white'),
    zone('Bedroom', 'bedroom', 3.4, 0.6, 6.6, 4),
    zone('Bedroom', 'bedroom', -3.4, -3.2, 6.6, 0.6),
  ])
  furnish(upper, 'bed-double', -1.6, 2.4)
  furnish(upper, 'bed-double', 5, 2.4)
  furnish(upper, 'bed-double', 2, -1.2)
  furnish(upper, 'wardrobe', -2.8, 1.2)
  furnish(upper, 'toilet', 1.2, 3.4)
  furnish(upper, 'washbasin', 2.2, 3.5)
  furnish(upper, 'bathtub', 2.6, 1.6)
  garden(project, 5)
  addPool(project, [
    { x: 8.2, y: -1.2 },
    { x: 12.4, y: -1.2 },
    { x: 12.4, y: 2.6 },
    { x: 8.2, y: 2.6 },
  ])
  return project
}
