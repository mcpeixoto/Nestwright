import { createOpening, createProject } from '../../src/model/defaults'
import { newId } from '../../src/model/ids'
import { addItem, addOpening, addWallChain } from '../../src/model/ops'
import { ensureRoomRecords } from '../../src/model/rooms'
import type { Project, Vec2 } from '../../src/model/types'

export function ring(points: Vec2[]): Vec2[] {
  return [...points, points[0]!]
}

export function rect(w: number, d: number): Vec2[] {
  return ring([
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ])
}

/** A 6 × 4 m room (0.2 m walls) with a door, a window, two items and a user dimension. */
export function sampleProject(opts: { flipHinge?: boolean; units?: Project['units'] } = {}): Project {
  const project = createProject('Casa Pátio', 'house')
  project.units = opts.units ?? 'metric'
  const level = project.levels[0]!
  const ids = addWallChain(level, rect(6, 4), { thickness: 0.2 })
  const bottom = level.walls.find((w) => w.id === ids[0])!
  const top = level.walls.find((w) => w.id === ids[2])!
  addOpening(level, createOpening('door', bottom.id, 1.5, { width: 0.9, flipHinge: opts.flipHinge }))
  addOpening(level, createOpening('window', top.id, 3, { width: 1.2 }))
  for (const [x, y, w, d] of [
    [2, 2, 2, 0.9],
    [4.5, 1, 0.8, 0.8],
  ] as const) {
    addItem(level, {
      id: newId('item'),
      catalogId: 'sofa-3',
      position: { x, y },
      elevation: 0,
      rotation: 0,
      size: { w, d, h: 0.8 },
      materials: {},
      params: {},
    })
  }
  level.dimensions.push({ id: newId('dim'), a: { x: 0, y: 0 }, b: { x: 3.25, y: 0 }, offset: -0.9 })
  ensureRoomRecords(level)
  level.rooms[0]!.name = 'Sala de estar'
  return project
}
