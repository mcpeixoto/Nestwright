import { describe, expect, it } from 'vitest'
import { createProject, createWall } from '../../src/model/defaults'
import type { Level, Vec2 } from '../../src/model/types'
import {
  BEFORE_SWITCH_NAME,
  deleteVariant,
  diffVariants,
  duplicateVariant,
  planSwitch,
  renameVariant,
  summariseDiff,
  variantFrom,
} from '../../src/model/variants'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

describe('variants', () => {
  it('keeps a snapshot, and switching files the current design as Before switching…', () => {
    const project = createProject('Home', 'house')
    loop(project.levels[0]!, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    const saved = variantFrom(project, 'Scheme', 'v1', 10)
    project.variants.push(saved)
    project.levels[0]!.name = 'Changed'
    expect(saved.levels[0]?.name).not.toBe('Changed')

    const plan = planSwitch(project, 'v1', 'before', 20)
    expect(plan).not.toBeNull()
    expect(plan?.levels[0]?.name).not.toBe('Changed')
    expect(plan?.before.name).toBe(BEFORE_SWITCH_NAME)
    expect(plan?.before.levels[0]?.name).toBe('Changed')
    expect(planSwitch(project, 'missing', 'x', 1)).toBeNull()
  })

  it('renames, duplicates and deletes without touching the others', () => {
    const project = createProject('Home', 'house')
    const first = variantFrom(project, 'One', 'a', 1)
    const second = variantFrom(project, 'Two', 'b', 2)
    let variants = [first, second]
    variants = renameVariant(variants, 'a', 'North')
    expect(variants[0]?.name).toBe('North')
    expect(variants[1]?.name).toBe('Two')
    variants = duplicateVariant(variants, 'b', 'c', 3)
    expect(variants).toHaveLength(3)
    expect(variants[2]?.name).toBe('Two copy')
    expect(variants[2]?.id).toBe('c')
    variants = deleteVariant(variants, 'a')
    expect(variants.map((item) => item.id)).toEqual(['b', 'c'])
  })

  it('diffs rooms, area, items and cost', () => {
    const bare = createProject('A', 'house')
    const built = createProject('B', 'house')
    loop(built.levels[0]!, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    built.levels[0]!.items.push({
      id: 'lamp',
      catalogId: 'lamp',
      position: { x: 1, y: 1 },
      elevation: 0,
      rotation: 0,
      size: { w: 0.2, d: 0.2, h: 0.4 },
      materials: {},
      params: {},
      price: 100,
    })
    const diff = diffVariants(variantFrom(bare, 'Bare', 'a', 1), variantFrom(built, 'Built', 'b', 2), built.budget)
    expect(diff.roomsAdded).toContain('Living 1')
    expect(diff.roomsRemoved).toHaveLength(0)
    expect(diff.areaChange).toBeCloseTo(16)
    expect(diff.itemChange).toBe(1)
    expect(diff.costChange).toBeGreaterThan(100)
    expect(summariseDiff(diff)).toContain('Living 1')
    expect(summariseDiff(diff)).toContain('+1 items')
  })
})
