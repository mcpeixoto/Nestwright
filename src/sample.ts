import './catalog'
import { getEntry } from './catalog/registry'
import { createProject } from './model/defaults'
import { newId } from './model/ids'
import { addWallChain, placeOpening } from './model/ops'
import { detectRooms } from './model/rooms'
import type { Item, Level, OpeningType, RoomType, Vec2, Wall } from './model/types'
import { findWallAt, locateOnWall } from './model/walls'

function place(level: Level, catalogId: string, x: number, y: number, rotation = 0, elevation = 0) {
  const entry = getEntry(catalogId)
  if (!entry) return
  const item: Item = {
    id: newId('item'),
    catalogId,
    position: { x, y },
    elevation,
    rotation,
    size: { ...entry.defaultSize },
    materials: Object.fromEntries(Object.entries(entry.materialSlots).map(([key, value]) => [key, { ...value }])),
    params: {},
    price: entry.price,
    lightOn: entry.light ? true : undefined,
  }
  level.items.push(item)
}

function cut(level: Level, type: OpeningType, at: Vec2) {
  const wall: Wall | null = findWallAt(level, at, 0.25)
  if (!wall) return
  const loc = locateOnWall(wall, at)
  placeOpening(level, type, wall.id, loc.distance)
}

/** A small furnished ground floor so the first launch isn't an empty grid. */
export function createSampleProject() {
  const project = createProject('Willow Cottage', 'house')
  const level = project.levels[0]
  if (!level) return project
  level.name = 'Ground'
  const shell = {
    height: level.height,
    thickness: 0.2,
    left: { id: 'plaster-white' },
    right: { id: 'brick-white' },
  }
  const partition = {
    height: level.height,
    thickness: 0.12,
    left: { id: 'plaster-warm' },
    right: { id: 'plaster-warm' },
  }
  addWallChain(
    level,
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
      { x: 0, y: 0 },
    ],
    shell,
  )
  addWallChain(level, [
    { x: 6, y: 0 },
    { x: 6, y: 8 },
  ], partition)
  addWallChain(level, [
    { x: 6, y: 4 },
    { x: 10, y: 4 },
  ], partition)

  for (const room of detectRooms(level)) {
    let type: RoomType = 'living'
    let name = 'Living room'
    let floor = 'herringbone-oak'
    if (room.centroid.x > 6) {
      if (room.centroid.y > 4) {
        type = 'kitchen'
        name = 'Kitchen'
        floor = 'tile-white'
      } else {
        type = 'bedroom'
        name = 'Bedroom'
        floor = 'oak-planks'
      }
    }
    level.rooms.push({
      key: room.key,
      name,
      type,
      floor: { id: floor },
      ceiling: { id: 'plaster-white' },
    })
  }

  cut(level, 'door', { x: 3, y: 0 })
  cut(level, 'window', { x: 4.8, y: 0 })
  cut(level, 'window', { x: 0, y: 2.4 })
  cut(level, 'window', { x: 3, y: 8 })
  cut(level, 'window', { x: 10, y: 2 })
  cut(level, 'tall-window', { x: 10, y: 6.2 })
  cut(level, 'door', { x: 6, y: 2 })

  place(level, 'rug', 2.1, 4.5)
  place(level, 'sofa-3', 0.55, 4.5, -Math.PI / 2)
  place(level, 'coffee-table', 2.15, 4.5)
  place(level, 'floor-lamp', 1.15, 6.3)
  place(level, 'armchair', 4.5, 6.15, Math.PI / 2)
  place(level, 'plant-pot', 5.25, 1.15)
  place(level, 'bed-double', 8.05, 2.85, Math.PI)
  place(level, 'nightstand', 6.75, 3.35)
  place(level, 'wardrobe', 9.55, 1.15, Math.PI / 2)
  place(level, 'dining-table', 8, 6.15)
  place(level, 'dining-chair', 8, 6.95, Math.PI)
  place(level, 'dining-chair', 8, 5.4, 0)
  place(level, 'plant-pot', 9.15, 7.35)
  return project
}
