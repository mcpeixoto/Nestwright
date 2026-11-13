import { describe, expect, it } from 'vitest'
import { createLevel, createWall } from '../../src/model/defaults'
import { paintLevel, wallFace } from '../../src/model/paint'
import { detectRooms } from '../../src/model/rooms'

describe('paint', () => {
  it('paints the wall side nearest the point', () => {
    const level = createLevel('G', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 })
    level.walls.push(wall)
    expect(wallFace(wall, { x: 2, y: 0.4 })).toBe('left')
    expect(wallFace(wall, { x: 2, y: -0.4 })).toBe('right')
    const before = wall.right.id
    paintLevel(level, { kind: 'wall', id: wall.id, side: 'left' }, { id: 'paint-ochre', tint: '#cc8800', scale: 1.5 })
    expect(wall.left).toEqual({ id: 'paint-ochre', tint: '#cc8800', scale: 1.5 })
    expect(wall.right.id).toBe(before)
  })

  it('paints a room floor and ceiling', () => {
    const level = createLevel('G', 0)
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (a && b) level.walls.push(createWall(a, b))
    }
    const room = detectRooms(level)[0]
    expect(room).toBeTruthy()
    if (!room) return
    paintLevel(level, { kind: 'floor', key: room.key }, { id: 'oak-planks' })
    paintLevel(level, { kind: 'ceiling', key: room.key }, { id: 'plaster-pink' })
    const stored = level.rooms.find((entry) => entry.key === room.key)
    expect(stored?.floor.id).toBe('oak-planks')
    expect(stored?.ceiling.id).toBe('plaster-pink')
  })
})
