import { describe, expect, it } from 'vitest'
import { convexPenetration, itemFootprint } from '../../src/model/clearance'
import { createLevel, createWall } from '../../src/model/defaults'
import { facingRotation, freeSpot } from '../../src/model/freeSpot'
import type { Item, Level, Vec2 } from '../../src/model/types'

function box(level: Level, x0: number, y0: number, x1: number, y1: number) {
  const pts: Vec2[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
  for (let i = 0; i < 4; i++) level.walls.push(createWall(pts[i]!, pts[(i + 1) % 4]!))
}

function item(id: string, x: number, y: number, w: number, d: number, catalogId = 'sofa-3'): Item {
  return {
    id,
    catalogId,
    position: { x, y },
    elevation: 0,
    rotation: 0,
    size: { w, d, h: 0.8 },
    materials: {},
    params: {},
  } as Item
}

const size = { w: 2.2, d: 0.95 }

/** Where the item's front (local +y) points on the plan after `rotation`. */
function front(rotation: number): Vec2 {
  return { x: -Math.sin(rotation), y: Math.cos(rotation) }
}

describe('facingRotation', () => {
  it('turns the front towards the point, in 90° steps', () => {
    const o = { x: 0, y: 0 }
    for (const toward of [
      { x: 0, y: 3 },
      { x: -3, y: 0.4 },
      { x: 0.2, y: -3 },
      { x: 3, y: 0 },
    ]) {
      const f = front(facingRotation(o, toward))
      const len = Math.hypot(toward.x, toward.y)
      // Within 45° of the direction asked for.
      expect((f.x * toward.x + f.y * toward.y) / len).toBeGreaterThan(Math.SQRT1_2 - 1e-9)
    }
    expect(facingRotation(o, o)).toBe(0)
  })
})

describe('freeSpot', () => {
  it('keeps the target when it is already free inside the room', () => {
    const level = createLevel('Ground', 0)
    box(level, 0, 0, 6, 5)
    const { position } = freeSpot(level, { x: 3, y: 2.5 }, size)
    expect(Math.hypot(position.x - 3, position.y - 2.5)).toBeLessThan(0.1)
  })

  it('moves off a wall the target sits on and faces into the room', () => {
    const level = createLevel('Ground', 0)
    box(level, 0, 0, 6, 5)
    const spot = freeSpot(level, { x: 3, y: 0 }, size)
    // Wall centre line at y = 0, half thickness 0.1, so the item's near edge is past 0.1.
    expect(spot.position.y - size.d / 2).toBeGreaterThanOrEqual(0.1)
    expect(Math.abs(spot.position.x - 3)).toBeLessThan(0.15)
    expect(front(spot.rotation).y).toBeCloseTo(1)
  })

  it('faces the room from against the far wall too, keeping clear of it', () => {
    const level = createLevel('Ground', 0)
    box(level, 0, 0, 6, 5)
    const spot = freeSpot(level, { x: 3, y: 5 }, size)
    expect(front(spot.rotation).y).toBeCloseTo(-1)
    const footprint = itemFootprint({ position: spot.position, rotation: spot.rotation, size: { ...size, h: 0.8 } })
    for (const corner of footprint) expect(corner.y).toBeLessThanOrEqual(4.9 + 1e-9)
  })

  it('swaps the footprint when it turns a quarter, so it still fits beside a side wall', () => {
    const level = createLevel('Ground', 0)
    box(level, 0, 0, 6, 5)
    const spot = freeSpot(level, { x: 0, y: 2.5 }, size)
    expect(Math.abs(front(spot.rotation).x)).toBeCloseTo(1)
    const footprint = itemFootprint({ position: spot.position, rotation: spot.rotation, size: { ...size, h: 0.8 } })
    for (const corner of footprint) expect(corner.x).toBeGreaterThanOrEqual(0.1 - 1e-9)
  })

  it('does not land on furniture that is already there', () => {
    const level = createLevel('Ground', 0)
    box(level, 0, 0, 6, 5)
    level.items.push(item('sofa', 3, 2.5, 2.2, 0.95))
    const spot = freeSpot(level, { x: 3, y: 2.5 }, size)
    const placed = itemFootprint({ position: spot.position, rotation: spot.rotation, size: { ...size, h: 0.8 } })
    expect(convexPenetration(placed, itemFootprint(level.items[0]!))).toBeLessThanOrEqual(0)
  })

  it('ignores rugs and other flat items', () => {
    const level = createLevel('Ground', 0)
    box(level, 0, 0, 6, 5)
    const rug = item('rug', 3, 2.5, 3, 2, 'rug-rect')
    rug.size.h = 0.01
    level.items.push(rug)
    const { position } = freeSpot(level, { x: 3, y: 2.5 }, size)
    expect(Math.hypot(position.x - 3, position.y - 2.5)).toBeLessThan(0.1)
  })

  it('uses the largest room when the target is outside every room', () => {
    const level = createLevel('Ground', 0)
    box(level, 0, 0, 3, 3)
    box(level, 10, 0, 16, 5)
    const { position } = freeSpot(level, { x: 30, y: 30 }, size)
    expect(position.x).toBeGreaterThan(10)
    expect(position.x).toBeLessThan(16)
  })

  it('returns the target at rotation 0 when the level has no rooms', () => {
    const level = createLevel('Ground', 0)
    expect(freeSpot(level, { x: 1, y: 2 }, size)).toEqual({ position: { x: 1, y: 2 }, rotation: 0 })
  })
})
