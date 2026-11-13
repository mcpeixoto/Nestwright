import { describe, expect, it } from 'vitest'
import { arcCircle } from '../../src/model/geometry'
import { createLevel, createWall } from '../../src/model/defaults'
import { detectRooms, roomKeyAt } from '../../src/model/rooms'
import { pointAlongWall, wallLength } from '../../src/model/walls'

describe('curved walls', () => {
  it('measures arc length and uses the arc as the room boundary', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { bulge: 1 })
    const circle = arcCircle(wall.a, wall.b, wall.bulge)
    expect(circle).toBeTruthy()
    expect(wallLength(wall)).toBeGreaterThan(4)
    expect(wallLength(wall)).toBeCloseTo(Math.abs(circle!.sweep) * circle!.radius, 4)

    const level = createLevel('Ground', 0)
    level.walls.push(
      wall,
      createWall({ x: 4, y: 0 }, { x: 4, y: 4 }),
      createWall({ x: 4, y: 4 }, { x: 0, y: 4 }),
      createWall({ x: 0, y: 4 }, { x: 0, y: 0 }),
    )
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]!.area).toBeLessThan(15.5)
    expect(rooms[0]!.area).toBeGreaterThan(12)
    expect(roomKeyAt(level, { x: 2, y: 2 })).toBe(rooms[0]!.key)
    expect(roomKeyAt(level, { x: 2, y: 0.15 })).toBeNull()

    const mid = pointAlongWall(wall, wallLength(wall) / 2)
    expect(mid.y).toBeGreaterThan(0.7)
  })
})
