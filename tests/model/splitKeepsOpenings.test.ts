import { describe, expect, it } from 'vitest'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import { dist } from '../../src/model/geometry'
import { moveWallEndpoint } from '../../src/model/ops'
import { pointAlongWall, splitWall } from '../../src/model/walls'

function setup(offset = 3) {
  const level = createLevel('G', 0)
  const wall = createWall({ x: 0, y: 0 }, { x: 6, y: 0 })
  const door = createOpening('door', wall.id, offset, { width: 0.9 })
  level.walls.push(wall)
  level.openings.push(door)
  return { level, wall, door }
}

describe('splitWall keeps openings', () => {
  it('moves the door to the spawned half when the cut is before its centre', () => {
    const { level, wall, door } = setup()
    const r = splitWall(level, wall.id, { x: 2, y: 0 })
    expect(door.wallId).toBe(r?.b.id)
    expect(door.offset).toBeCloseTo(1)
  })

  it('keeps the door on the kept half when the cut is past it', () => {
    const { level, wall, door } = setup()
    const r = splitWall(level, wall.id, { x: 4, y: 0 })
    expect(door.wallId).toBe(r?.a.id)
    expect(door.offset).toBe(3)
  })

  it('clamps a door cut inside its span onto the kept half', () => {
    const { level, wall, door } = setup()
    const r = splitWall(level, wall.id, { x: 3.2, y: 0 })
    expect(door.wallId).toBe(r?.a.id)
    expect(door.offset).toBeCloseTo(2.75)
  })

  it('drops a door that cannot fit its half', () => {
    const { level, wall } = setup(0.45)
    splitWall(level, wall.id, { x: 0.5, y: 0 })
    expect(level.openings).toHaveLength(0)
  })

  it('keeps door positions when an endpoint moves after a split', () => {
    const { level, wall } = setup()
    const r = splitWall(level, wall.id, { x: 2, y: 0 })
    const centre = (o: (typeof level.openings)[number]) =>
      pointAlongWall(level.walls.find((w) => w.id === o.wallId)!, o.offset)
    const before = level.openings.map(centre)
    moveWallEndpoint(level, r!.b.id, 'b', { x: 7, y: 0 })
    expect(level.openings).toHaveLength(before.length)
    level.openings.forEach((o, i) => expect(dist(centre(o), before[i]!)).toBeLessThan(0.05))
  })
})
