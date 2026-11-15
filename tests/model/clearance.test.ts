import { describe, expect, it } from 'vitest'
import { clearanceIssues, itemOverlaps, overlappingIds, WALKWAY_MIN } from '../../src/model/clearance'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import type { Item, Level } from '../../src/model/types'

function item(id: string, x: number, y: number, w: number, d: number, rotation = 0, h = 0.8): Item {
  return {
    id,
    catalogId: 'chair',
    position: { x, y },
    elevation: 0,
    rotation,
    size: { w, d, h },
    materials: {},
    params: {},
  }
}

describe('item overlaps', () => {
  it('flags intersecting rotated items and not touching ones', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('a', 0, 0, 1, 1), item('b', 0.9, 0, 1, 1, Math.PI / 4))
    expect(itemOverlaps(level).pairs).toEqual([['a', 'b']])
    level.items[1] = item('b', 1, 0, 1, 1)
    expect(itemOverlaps(level).pairs).toEqual([])
  })

  it('misses a rotated item whose corner clears the other', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('a', 0, 0, 1, 1), item('b', 1.25, 1.25, 1, 1, Math.PI / 4))
    expect(itemOverlaps(level).pairs).toEqual([])
  })

  it('ignores a flat rug and an item standing on another', () => {
    const level = createLevel('Ground', 0)
    const lamp = item('lamp', 0, 0, 0.3, 0.3)
    lamp.elevation = 0.8
    level.items.push(item('a', 0, 0, 1, 1), item('rug', 0, 0, 2, 2, 0, 0.02), lamp)
    expect(itemOverlaps(level).pairs).toEqual([])
  })

  it('flags an item cutting into a wall', () => {
    const level = createLevel('Ground', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.2 })
    level.walls.push(wall)
    level.items.push(item('a', 2, 0.3, 1, 0.5), item('b', 2, 1, 0.5, 0.5))
    const report = itemOverlaps(level)
    expect(report.walls).toEqual([{ itemId: 'a', wallId: wall.id }])
    expect([...overlappingIds(report)]).toEqual(['a'])
    level.items[0] = item('a', 2, 0.35, 1, 0.5)
    expect(itemOverlaps(level).walls).toEqual([])
  })
})

describe('clearance', () => {
  function doorLevel(flipSide: boolean): Level {
    const level = createLevel('Ground', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.2 })
    level.walls.push(wall)
    level.openings.push(createOpening('door', wall.id, 2, { width: 0.9, flipSide }))
    level.items.push(item('a', 1.9, 0.6, 0.4, 0.4))
    return level
  }

  it('flags an item in a door swing and clears it when the swing flips', () => {
    const swings = clearanceIssues(doorLevel(false)).filter((issue) => issue.kind === 'door-swing')
    expect(swings).toHaveLength(1)
    expect(swings[0]).toMatchObject({ kind: 'door-swing', itemId: 'a' })
    expect(clearanceIssues(doorLevel(true)).filter((issue) => issue.kind === 'door-swing')).toEqual([])
  })

  it('flags a 0.6 m walkway and not a 1.0 m one', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('a', 0, 0, 1, 1), item('b', 1.6, 0, 1, 1))
    const issues = clearanceIssues(level)
    expect(issues).toHaveLength(1)
    const first = issues[0]!
    expect(first.kind).toBe('walkway')
    if (first.kind === 'walkway') {
      expect(first.gap).toBeCloseTo(0.6, 6)
      expect(first.gap).toBeLessThan(WALKWAY_MIN)
      expect(first.itemIds).toEqual(['a', 'b'])
    }
    level.items[1] = item('b', 2.0, 0, 1, 1)
    expect(clearanceIssues(level)).toEqual([])
  })

  it('does not count touching items or short overlaps as walkways', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('a', 0, 0, 1, 1), item('b', 1.02, 0, 1, 1), item('c', 0, 1.6, 1, 1))
    level.items.push(item('d', 1.75, 1.6, 1, 1))
    expect(clearanceIssues(level).filter((issue) => issue.kind === 'walkway' && issue.itemIds.includes('b'))).toEqual([])
  })

  it('flags a narrow gap between an item and a wall face', () => {
    const level = createLevel('Ground', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.2 })
    level.walls.push(wall)
    level.items.push(item('a', 2, 0.1 + 0.5 + 0.7, 1.5, 1))
    const issues = clearanceIssues(level)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'walkway', wallId: wall.id, itemIds: ['a'] })
    if (issues[0]?.kind === 'walkway') expect(issues[0].gap).toBeCloseTo(0.7, 6)
  })
})
