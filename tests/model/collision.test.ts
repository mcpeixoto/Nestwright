import { describe, expect, it } from 'vitest'
import { moveCircle, solidSegments } from '../../src/model/collision'
import { createOpening, createWall } from '../../src/model/defaults'

describe('collision', () => {
  it('slides along a wall instead of crossing it', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 6, y: 0 }, { thickness: 0.2 })
    const segments = solidSegments(wall, [])
    const end = moveCircle({ x: 1, y: 1 }, 0.22, { x: 1.4, y: -2 }, segments)
    expect(end.x).toBeGreaterThan(1.8)
    expect(end.y).toBeGreaterThan(0.2)
    expect(end.y).toBeLessThan(0.55)
  })

  it('passes through a door opening', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.2 })
    const door = createOpening('door', wall.id, 2, { width: 0.9 })
    const segments = solidSegments(wall, [door])
    const end = moveCircle({ x: 2, y: -1 }, 0.2, { x: 0, y: 2 }, segments)
    expect(end.y).toBeGreaterThan(0.5)
    expect(end.x).toBeCloseTo(2, 1)
  })

  it('blocks on a window', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.2 })
    const window = createOpening('window', wall.id, 2, { width: 1.2 })
    const segments = solidSegments(wall, [window])
    const end = moveCircle({ x: 2, y: -1 }, 0.2, { x: 0, y: 2 }, segments)
    expect(end.y).toBeLessThan(0)
    expect(segments).toHaveLength(1)
  })
})
