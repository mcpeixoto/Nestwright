import { describe, expect, it } from 'vitest'
import { createLevel, createWall } from '../../src/model/defaults'
import { detectRooms, roomKeyAt } from '../../src/model/rooms'
import type { Level, Vec2 } from '../../src/model/types'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

describe('rooms', () => {
  it('detects one room in a 4-wall square, with the right area', () => {
    const level = createLevel('G', 0)
    loop(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.area).toBeCloseTo(16)
    expect(rooms[0]?.type).toBe('living')
    expect(rooms[0]?.name).toBe('Living 1')
    expect(rooms[0]?.centroid.x).toBeCloseTo(2)
    expect(rooms[0]?.centroid.y).toBeCloseTo(2)
    expect(roomKeyAt(level, { x: 2, y: 2 })).toBe(rooms[0]?.key)
    expect(roomKeyAt(level, { x: 9, y: 9 })).toBeNull()
  })

  it('splits a square with a middle wall into two rooms', () => {
    const level = createLevel('G', 0)
    loop(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    level.walls.push(createWall({ x: 0, y: 2 }, { x: 4, y: 2 }))
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(2)
    const areas = rooms.map((r) => r.area).sort((a, b) => a - b)
    expect(areas[0]).toBeCloseTo(8)
    expect(areas[1]).toBeCloseTo(8)
  })

  it('handles a T-junction that was never pre-split', () => {
    const level = createLevel('G', 0)
    level.walls.push(
      createWall({ x: 0, y: 0 }, { x: 4, y: 0 }),
      createWall({ x: 4, y: 0 }, { x: 4, y: 4 }),
      createWall({ x: 4, y: 4 }, { x: 0, y: 4 }),
      createWall({ x: 0, y: 4 }, { x: 0, y: 0 }),
      createWall({ x: 2, y: 0 }, { x: 2, y: 4 }),
    )
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(2)
    expect(rooms.reduce((s, r) => s + r.area, 0)).toBeCloseTo(16)
  })

  it('detects an L-shaped room', () => {
    const level = createLevel('G', 0)
    loop(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ])
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.area).toBeCloseTo(12)
    expect(roomKeyAt(level, { x: 1, y: 1 })).toBe(rooms[0]?.key)
    expect(roomKeyAt(level, { x: 3, y: 3 })).toBeNull()
  })

  it('keeps user room props keyed by the bounding walls and ignores railings', () => {
    const level = createLevel('G', 0)
    loop(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ])
    const first = detectRooms(level)[0]!
    level.rooms.push({
      key: first.key,
      name: 'Kitchen',
      type: 'kitchen',
      floor: { id: 'tile-white' },
      ceiling: { id: 'plaster-white' },
    })
    level.walls.push(createWall({ x: 0, y: 3 }, { x: 1, y: 5 }, { kind: 'railing' }))
    const again = detectRooms(level)
    expect(again).toHaveLength(1)
    expect(again[0]?.name).toBe('Kitchen')
    expect(again[0]?.type).toBe('kitchen')
    expect(again[0]?.floor.id).toBe('tile-white')
  })
})
