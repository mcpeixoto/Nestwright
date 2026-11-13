import { roomsFor } from '../../store'
import type { Item, Level, Opening, Room, Wall } from '../../model/types'
import type { InspectorMatchState } from './registry'

export interface SelectionFacts {
  level: Level | null
  walls: Wall[]
  openings: Opening[]
  items: Item[]
  room: Room | null
  total: number
}

export function selectionFacts(selection: readonly string[], state: InspectorMatchState): SelectionFacts {
  const level = state.project.levels.find((item) => item.id === state.activeLevelId) ?? null
  if (!level) return { level: null, walls: [], openings: [], items: [], room: null, total: 0 }
  const walls = level.walls.filter((wall) => selection.includes(wall.id))
  const openings = level.openings.filter((opening) => selection.includes(opening.id))
  const items = level.items.filter((item) => selection.includes(item.id))
  const room = roomsFor(level).find((item) => selection.includes(item.key)) ?? null
  const terrain = state.project.terrain
  const outside = terrain
    ? terrain.plants.filter((plant) => selection.includes(plant.id)).length +
      terrain.water.filter((body) => selection.includes(body.id)).length +
      terrain.fences.filter((fence) => selection.includes(fence.id)).length
    : 0
  const total = walls.length + openings.length + items.length + (room ? 1 : 0) + outside
  return { level, walls, openings, items, room, total }
}
