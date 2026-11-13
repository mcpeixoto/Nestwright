import type { Project } from '../model/types'
import { addColumn, addRoof, addSlab, addTree, cut, fillGround, fresh, furnish, labelZones, shell, upperStorey, zone } from './build'

/** Stilted terrace, flat roof, tall glazing, and sand. */
export function beachHouse(): Project {
  const project = fresh('Beach house', 'house', { width: 40, depth: 32 })
  const stilts = project.levels[0]
  if (!stilts) return project
  stilts.name = 'Stilts'
  stilts.height = 2.4
  for (const x of [-5, -1.6, 1.6, 5]) {
    for (const y of [-2.4, 2.4]) addColumn(stilts, x, y)
  }
  addSlab(
    stilts,
    [
      { x: -7.2, y: -5.4 },
      { x: 7.2, y: -5.4 },
      { x: 7.2, y: 3.6 },
      { x: -7.2, y: 3.6 },
    ],
    2.4,
  )
  const house = upperStorey(project, 'House', 2.4)
  shell(house, [
    { x: -5.5, y: -2.8 },
    { x: 5.5, y: -2.8 },
    { x: 5.5, y: 2.8 },
    { x: -5.5, y: 2.8 },
  ])
  cut(house, { x: 0, y: -2.8 }, 'sliding-door')
  cut(house, { x: -3.2, y: -2.8 }, 'tall-window')
  cut(house, { x: 3.2, y: -2.8 }, 'tall-window')
  cut(house, { x: -3.2, y: 2.8 }, 'tall-window')
  cut(house, { x: 3.2, y: 2.8 }, 'tall-window')
  cut(house, { x: 5.5, y: 0 }, 'tall-window')
  cut(house, { x: -5.5, y: 0 }, 'door')
  addRoof(house, 'flat')
  labelZones(house, [zone('Living', 'living', -5.5, -2.8, 5.5, 2.8)])
  furnish(house, 'sofa-3', 0, 0.6, Math.PI)
  furnish(house, 'coffee-table', 0, -0.4)
  furnish(house, 'lounger', -3.2, 1.2)
  furnish(house, 'lounger', 3.2, 1.2)
  furnish(house, 'dining-table', 3.4, -1.2)
  fillGround(project, 'sand')
  addTree(project, -8, -1, 'palm')
  addTree(project, 8.5, 1.5, 'palm')
  return project
}
