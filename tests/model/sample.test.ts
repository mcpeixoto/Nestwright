import { describe, expect, it } from 'vitest'
import { buildFloors } from '../../src/builders/floors'
import { buildItem } from '../../src/builders/items'
import { buildOpening } from '../../src/builders/openings'
import { buildWall } from '../../src/builders/walls'
import { detectRooms } from '../../src/model/rooms'
import { createSampleProject } from '../../src/sample'

describe('sample project', () => {
  it('starts with three furnished rooms and a front door', () => {
    const project = createSampleProject()
    const level = project.levels[0]
    if (!level) throw new Error('expected a ground floor')
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(3)
    expect(rooms.reduce((sum, room) => sum + room.area, 0)).toBeCloseTo(80, 1)
    expect(level.openings.some((opening) => opening.type === 'door')).toBe(true)
    expect(level.items.length).toBeGreaterThan(5)
    for (const wall of level.walls) {
      buildWall(wall, level, level.walls)
      for (const opening of level.openings) {
        if (opening.wallId === wall.id) buildOpening(opening, wall, level.elevation)
      }
    }
    buildFloors(level, rooms)
    for (const item of level.items) buildItem(item)
  })
})
