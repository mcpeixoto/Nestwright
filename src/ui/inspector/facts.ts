import { roomsFor } from '../../store'
import type { Column, Item, Level, Opening, Roof, Room, Slab, Stair, Wall } from '../../model/types'
import type { InspectorMatchState } from './registry'

export interface SelectionFacts {
  level: Level | null
  walls: Wall[]
  openings: Opening[]
  items: Item[]
  room: Room | null
  stairs: Stair[]
  roofs: Roof[]
  columns: Column[]
  slabs: Slab[]
  total: number
}

export function selectionFacts(selection: readonly string[], state: InspectorMatchState): SelectionFacts {
  const level = state.project.levels.find((item) => item.id === state.activeLevelId) ?? null
  if (!level) {
    return { level: null, walls: [], openings: [], items: [], room: null, stairs: [], roofs: [], columns: [], slabs: [], total: 0 }
  }
  const walls = level.walls.filter((wall) => selection.includes(wall.id))
  const openings = level.openings.filter((opening) => selection.includes(opening.id))
  const items = level.items.filter((item) => selection.includes(item.id))
  const stairs = level.stairs.filter((stair) => selection.includes(stair.id))
  const roofs = level.roofs.filter((roof) => selection.includes(roof.id))
  const columns = level.columns.filter((column) => selection.includes(column.id))
  const slabs = level.slabs.filter((slab) => selection.includes(slab.id))
  const room = roomsFor(level).find((item) => selection.includes(item.key)) ?? null
  const total = walls.length + openings.length + items.length + stairs.length + roofs.length + columns.length + slabs.length + (room ? 1 : 0)
  return { level, walls, openings, items, room, stairs, roofs, columns, slabs, total }
}
