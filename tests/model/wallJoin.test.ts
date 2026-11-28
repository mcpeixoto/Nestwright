import { describe, expect, it } from 'vitest'
import { createLevel, createWall } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'
import { detectRooms } from '../../src/model/rooms'
import type { Level, Vec2 } from '../../src/model/types'
import { connectedWalls } from '../../src/model/walls'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

function square(): Level {
  const level = createLevel('G', 0)
  loop(level, [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 5 },
    { x: 0, y: 5 },
  ])
  return level
}

const wallOf = (level: Level, id: string | undefined) => level.walls.find((w) => w.id === id)

describe('wall joins', () => {
  it('pulls an endpoint 2 cm from a corner onto the corner', () => {
    const level = square()
    const [id] = addWallChain(level, [
      { x: 6.02, y: 2 },
      { x: 9, y: 2 },
    ])
    expect(wallOf(level, id)?.a).toEqual({ x: 6, y: 2 })
    expect(level.walls).toHaveLength(6)
  })

  it('pulls an endpoint 4.9 cm from a wall face onto the face and splits it', () => {
    const level = square()
    const [id] = addWallChain(level, [
      { x: 3, y: 5.049 },
      { x: 3, y: 8 },
    ])
    expect(wallOf(level, id)?.a.y).toBe(5)
    expect(level.walls).toHaveLength(6)
    expect(connectedWalls(level, { x: 3, y: 5 })).toHaveLength(3)
  })

  it('leaves a 6 cm miss alone', () => {
    const level = square()
    const [id] = addWallChain(level, [
      { x: 3, y: 5.06 },
      { x: 3, y: 8 },
    ])
    expect(level.walls).toHaveLength(5)
    expect(wallOf(level, id)?.a.y).toBe(5.06)
  })

  it('splits the new wall at a T-junction when it passes within 5 cm of an existing end', () => {
    const level = square()
    const stub = createWall({ x: 2, y: 2 }, { x: 2, y: 3.03 })
    level.walls.push(stub)
    const ids = addWallChain(level, [
      { x: 0, y: 3 },
      { x: 6, y: 3 },
    ])
    expect(wallOf(level, stub.id)?.b).toEqual({ x: 2, y: 3 })
    const pieces = ids.map((id) => wallOf(level, id)).map((w) => [w?.a, w?.b])
    expect(pieces).toEqual([
      [{ x: 0, y: 3 }, { x: 2, y: 3 }],
      [{ x: 2, y: 3 }, { x: 6, y: 3 }],
    ])
    // 4 square walls + stub, left and right walls split at y=3, new wall in two.
    expect(level.walls).toHaveLength(9)
  })

  it('detects one room, not two, when a wall is drawn twice along the same line', () => {
    const level = square()
    level.walls.push(createWall({ x: 0, y: 0 }, { x: 6, y: 0 }))
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.area).toBeCloseTo(30)
  })
})
