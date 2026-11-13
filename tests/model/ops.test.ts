import { describe, expect, it } from 'vitest'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import { dist } from '../../src/model/geometry'
import { addWallChain, deleteEntities, moveItems, moveWallEndpoint, rotateItems } from '../../src/model/ops'
import { detectRooms } from '../../src/model/rooms'
import type { Item } from '../../src/model/types'

function item(partial: Partial<Item> = {}): Item {
  return {
    id: partial.id ?? 'item_test',
    catalogId: 'sofa-3',
    position: partial.position ?? { x: 1, y: 1 },
    elevation: 0,
    rotation: partial.rotation ?? 0,
    size: { w: 1, d: 1, h: 1 },
    materials: {},
    params: {},
    ...partial,
  }
}

describe('ops', () => {
  it('merges a T-junction onto an existing wall and splits it', () => {
    const level = createLevel('G', 0)
    addWallChain(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ])
    expect(level.walls).toHaveLength(1)
    addWallChain(level, [
      { x: 2, y: 0 },
      { x: 2, y: 3 },
    ])
    expect(level.walls).toHaveLength(3)
    const vertical = level.walls.find((w) => Math.abs(w.a.x - w.b.x) < 1e-6)
    expect(vertical).toBeTruthy()
    const joint = level.walls.filter((w) => dist(w.a, { x: 2, y: 0 }) < 1e-6 || dist(w.b, { x: 2, y: 0 }) < 1e-6)
    expect(joint.length).toBeGreaterThanOrEqual(3)
  })

  it('closes a square into one room via the chain op', () => {
    const level = createLevel('G', 0)
    addWallChain(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 0 },
    ])
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.area).toBeCloseTo(16)
  })

  it('moves connected endpoints together', () => {
    const level = createLevel('G', 0)
    const a = createWall({ x: 0, y: 0 }, { x: 2, y: 0 })
    const b = createWall({ x: 2, y: 0 }, { x: 2, y: 2 })
    level.walls.push(a, b)
    moveWallEndpoint(level, a.id, 'b', { x: 3, y: 1 })
    expect(a.b).toEqual({ x: 3, y: 1 })
    expect(b.a).toEqual({ x: 3, y: 1 })
    expect(b.b).toEqual({ x: 2, y: 2 })
  })

  it('removes openings with their wall', () => {
    const level = createLevel('G', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 3, y: 0 })
    level.walls.push(wall)
    level.openings.push(createOpening('door', wall.id, 1.5))
    deleteEntities(level, [wall.id])
    expect(level.walls).toHaveLength(0)
    expect(level.openings).toHaveLength(0)
  })

  it('moves and rotates items', () => {
    const level = createLevel('G', 0)
    const sofa = item({ id: 'a', position: { x: 1, y: 2 }, rotation: 0 })
    level.items.push(sofa)
    moveItems(level, ['a'], { x: 0.5, y: -0.25 })
    expect(sofa.position).toEqual({ x: 1.5, y: 1.75 })
    rotateItems(level, ['a'], Math.PI / 12)
    expect(sofa.rotation).toBeCloseTo(Math.PI / 12)
  })
})
