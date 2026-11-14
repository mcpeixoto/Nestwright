import { describe, expect, it } from 'vitest'
import { createLevel, createOpening } from '../../src/model/defaults'
import { dist } from '../../src/model/geometry'
import { addWallChain } from '../../src/model/ops'
import { openingGap, setOpeningGap, setWallLength, slideOpening } from '../../src/model/ops/sizes'
import { detectRooms } from '../../src/model/rooms'
import { wallLength } from '../../src/model/walls'

function box() {
  const level = createLevel('G', 0)
  addWallChain(level, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
    { x: 0, y: 0 },
  ])
  const bottom = level.walls.find((w) => Math.abs(w.a.y) < 1e-6 && Math.abs(w.b.y) < 1e-6)!
  return { level, bottom }
}

describe('setWallLength', () => {
  it('moves the far end and the joined wall follows, keeping the room closed', () => {
    const { level, bottom } = box()
    const fixed = { ...bottom.a }
    expect(setWallLength(level, bottom.id, 5.25)).toBe(true)
    expect(wallLength(bottom)).toBeCloseTo(5.25, 6)
    expect(dist(bottom.a, fixed)).toBeLessThan(1e-9)
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    // Top wall is untouched, so the room becomes a trapezoid with a 5.25 m bottom.
    const xs = rooms[0]!.polygon.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5.25, 6)
  })

  it('can keep the b end instead', () => {
    const { level, bottom } = box()
    const fixed = { ...bottom.b }
    setWallLength(level, bottom.id, 2, 'b')
    expect(dist(bottom.b, fixed)).toBeLessThan(1e-9)
    expect(wallLength(bottom)).toBeCloseTo(2, 6)
  })

  it('keeps openings at their distance from the fixed end and clamps them into a short wall', () => {
    const { level, bottom } = box()
    const door = createOpening('door', bottom.id, 1)
    level.openings.push(door)
    const gapBefore = openingGap(bottom, door, 'a')
    setWallLength(level, bottom.id, 6)
    expect(openingGap(bottom, door, 'a')).toBeCloseTo(gapBefore, 6)
    setWallLength(level, bottom.id, 1)
    expect(door.offset + door.width / 2).toBeLessThanOrEqual(wallLength(bottom) + 1e-6)
  })

  it('scales a curved wall so the arc length matches', () => {
    const level = createLevel('G', 0)
    addWallChain(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ])
    const wall = level.walls[0]!
    wall.bulge = 0.8
    setWallLength(level, wall.id, 7)
    expect(wallLength(wall)).toBeCloseTo(7, 6)
  })

  it('rejects silly lengths', () => {
    const { level, bottom } = box()
    expect(setWallLength(level, bottom.id, 0)).toBe(false)
    expect(setWallLength(level, bottom.id, Number.NaN)).toBe(false)
    expect(setWallLength(level, 'nope', 3)).toBe(false)
    expect(wallLength(bottom)).toBeCloseTo(4, 6)
  })
})

describe('opening position', () => {
  it('places an opening by its clear gap from either end', () => {
    const { level, bottom } = box()
    const window = createOpening('window', bottom.id, 2, { width: 1 })
    level.openings.push(window)
    expect(setOpeningGap(level, window.id, 'a', 0.5)).toBe(true)
    expect(window.offset).toBeCloseTo(1, 6)
    expect(setOpeningGap(level, window.id, 'b', 0.25)).toBe(true)
    expect(openingGap(bottom, window, 'b')).toBeCloseTo(0.25, 6)
  })

  it('refuses a gap that leaves the wall or overlaps a neighbour', () => {
    const { level, bottom } = box()
    const a = createOpening('window', bottom.id, 1, { width: 1 })
    const b = createOpening('window', bottom.id, 3, { width: 1 })
    level.openings.push(a, b)
    expect(setOpeningGap(level, a.id, 'a', 3.5)).toBe(false)
    expect(setOpeningGap(level, a.id, 'a', 2)).toBe(false)
    expect(a.offset).toBeCloseTo(1, 6)
  })

  it('slides along the wall, stopping at the ends and at neighbours', () => {
    const { level, bottom } = box()
    const a = createOpening('window', bottom.id, 1, { width: 1 })
    const b = createOpening('window', bottom.id, 3, { width: 1 })
    level.openings.push(a, b)
    slideOpening(level, a.id, -5)
    expect(a.offset).toBeCloseTo(0.5, 6)
    slideOpening(level, a.id, 10)
    expect(a.offset).toBeCloseTo(2, 6)
    slideOpening(level, b.id, 10)
    expect(b.offset).toBeCloseTo(3.5, 6)
  })
})
