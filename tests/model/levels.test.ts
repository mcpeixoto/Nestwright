import { describe, expect, it } from 'vitest'
import { createLevel, createWall } from '../../src/model/defaults'
import { duplicateLevel, insertLevel, removeLevel } from '../../src/model/levels'

describe('levels', () => {
  it('adds a level above at the previous elevation plus height and shifts higher floors', () => {
    const ground = createLevel('Ground', 0)
    ground.height = 2.7
    const first = createLevel('First', 2.7)
    first.height = 2.7
    const levels = [ground, first]
    const created = insertLevel(levels, ground.id, 'above')
    expect(created).toBeTruthy()
    expect(created?.elevation).toBeCloseTo(2.7)
    expect(ground.elevation).toBeCloseTo(0)
    expect(first.elevation).toBeCloseTo(5.4)
    expect(levels.map((level) => level.elevation)).toEqual([0, 2.7, 5.4])
  })

  it('inserts a level below by lifting the active floor so elevations stay stacked', () => {
    const ground = createLevel('Ground', 0)
    ground.height = 2.7
    const first = createLevel('First', 2.7)
    const levels = [ground, first]
    const created = insertLevel(levels, first.id, 'below')
    expect(created?.elevation).toBeCloseTo(2.7)
    expect(ground.elevation).toBeCloseTo(0)
    expect(first.elevation).toBeCloseTo(5.4)
    expect(created && first.elevation).toBeCloseTo((created?.elevation ?? 0) + (created?.height ?? 0))
  })

  it('duplicates walls only, with new ids', () => {
    const ground = createLevel('Ground', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { bulge: 0.4, kind: 'half', height: 1.1 })
    ground.walls.push(wall)
    ground.stairs.push({
      id: 'stair_keep',
      shape: 'straight',
      position: { x: 1, y: 1 },
      rotation: 0,
      width: 1,
      rise: 2.7,
      material: { id: 'oak-planks' },
      railing: false,
    })
    const levels = [ground]
    const copy = duplicateLevel(levels, ground.id)
    expect(copy?.walls).toHaveLength(1)
    expect(copy?.walls[0]?.id).not.toBe(wall.id)
    expect(copy?.walls[0]?.bulge).toBeCloseTo(0.4)
    expect(copy?.walls[0]?.kind).toBe('half')
    expect(copy?.stairs).toHaveLength(0)
    expect(copy?.elevation).toBeCloseTo(ground.height)
    expect(ground.walls[0]?.id).toBe(wall.id)
  })

  it('refuses to delete the last level', () => {
    const only = createLevel('Ground', 0)
    const levels = [only]
    expect(removeLevel(levels, only.id)).toBe(false)
    expect(levels).toHaveLength(1)
    const other = createLevel('First', 2.7)
    levels.push(other)
    expect(removeLevel(levels, only.id)).toBe(true)
    expect(levels.map((level) => level.id)).toEqual([other.id])
  })
})
