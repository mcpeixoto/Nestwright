import { describe, expect, it } from 'vitest'
import { dist } from '../../src/model/geometry'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import {
  connectedWalls,
  findWallAt,
  openingFits,
  openingInterval,
  splitWall,
  wallLength,
  wallPolygon,
} from '../../src/model/walls'

function near(poly: { x: number; y: number }[], p: { x: number; y: number }, eps = 1e-6) {
  return poly.some((q) => dist(q, p) < eps)
}

describe('walls', () => {
  it('mitres a 90° corner instead of leaving square ends', () => {
    const h = createWall({ x: 0, y: 0 }, { x: 2, y: 0 }, { thickness: 0.2 })
    const v = createWall({ x: 0, y: 0 }, { x: 0, y: 2 }, { thickness: 0.2 })
    const poly = wallPolygon(h, [v])
    expect(near(poly, { x: 0.1, y: 0.1 })).toBe(true)
    expect(near(poly, { x: -0.1, y: -0.1 })).toBe(true)
    expect(near(poly, { x: 2, y: 0.1 })).toBe(true)
    expect(near(poly, { x: 2, y: -0.1 })).toBe(true)
  })

  it('finds a wall under a point and lists the joint', () => {
    const level = createLevel('G', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.2 })
    const other = createWall({ x: 4, y: 0 }, { x: 4, y: 3 })
    level.walls.push(wall, other)
    expect(findWallAt(level, { x: 2, y: 0.05 }, 0.02)?.id).toBe(wall.id)
    expect(findWallAt(level, { x: 2, y: 2 }, 0.02)).toBeNull()
    expect(connectedWalls(level, { x: 4, y: 0 }).map((w) => w.id).sort()).toEqual([other.id, wall.id].sort())
  })

  it('validates openings and clamps an interval that overruns the wall', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { height: 2.7 })
    const door = createOpening('door', wall.id, 2)
    expect(openingFits(wall, door)).toBe(true)
    expect(wallLength(wall)).toBeCloseTo(4)
    const span = openingInterval(wall, door)
    expect(span.clamped).toBe(false)
    expect(span.end - span.start).toBeCloseTo(0.9)

    const tooWide = createOpening('door', wall.id, 0.2)
    expect(openingFits(wall, tooWide)).toBe(false)
    const clamped = openingInterval(wall, tooWide)
    expect(clamped.clamped).toBe(true)
    expect(clamped.start).toBeCloseTo(0)

    const tall = createOpening('door', wall.id, 2, { height: 3, sill: 0 })
    expect(openingFits(wall, tall)).toBe(false)
    const overlap = createOpening('window', wall.id, 2)
    expect(openingFits(wall, overlap, [door])).toBe(false)
  })

  it('splits a wall and moves openings past the cut', () => {
    const level = createLevel('G', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 })
    level.walls.push(wall)
    const opening = createOpening('window', wall.id, 3)
    level.openings.push(opening)
    const parts = splitWall(level, wall.id, { x: 2, y: 0 })
    expect(parts).not.toBeNull()
    expect(level.walls).toHaveLength(2)
    expect(dist(parts!.a.b, { x: 2, y: 0 })).toBeLessThan(1e-6)
    expect(dist(parts!.b.a, { x: 2, y: 0 })).toBeLessThan(1e-6)
    expect(opening.wallId).toBe(parts!.b.id)
    expect(opening.offset).toBeCloseTo(1)
  })
})
