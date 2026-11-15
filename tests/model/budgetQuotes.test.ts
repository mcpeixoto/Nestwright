import { describe, expect, it } from 'vitest'
import '../../src/catalog'
import { estimateBudget, variantBudgets } from '../../src/model/budget'
import { createProject, createWall } from '../../src/model/defaults'
import { deserialize, serialize } from '../../src/io/project'
import type { Level, Project, Vec2 } from '../../src/model/types'
import { variantFrom } from '../../src/model/variants'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

/** One room. Construction uses the centre-line area (`room.area`), 16 m² for a 4×4 loop. */
function room(name: string, width: number, depth: number): Project {
  const project = createProject(name, 'house')
  const level = project.levels[0]!
  loop(level, [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ])
  level.items.push({
    id: 'sofa',
    catalogId: 'sofa-2',
    position: { x: width / 2, y: depth / 2 },
    elevation: 0,
    rotation: 0,
    size: { w: 1, d: 1, h: 0.8 },
    materials: {},
    params: {},
  })
  return project
}

describe('budget quotes', () => {
  it('an item price override replaces the catalog price in the items total', () => {
    const project = room('Quoted sofa', 4, 4)
    const catalog = estimateBudget(project)
    const catalogLine = catalog.lines.find((line) => line.category === 'items')
    expect(catalogLine?.source).toBe('catalog')
    expect(catalog.byCategory.items).toBe(740)

    project.levels[0]!.items[0]!.price = 900
    const quoted = estimateBudget(project)
    const quotedLine = quoted.lines.find((line) => line.category === 'items')
    expect(quotedLine?.source).toBe('quote')
    expect(quoted.byCategory.items).toBe(900)
    expect(quoted.total).toBeCloseTo(catalog.total - 740 + 900)
  })

  it('a line override replaces the computed amount and the total', () => {
    const project = room('Quoted shell', 4, 4)
    const before = estimateBudget(project)
    const construction = before.lines.find((line) => line.category === 'construction')
    expect(construction?.id).toBeTruthy()
    expect(construction?.amount).toBeCloseTo(16 * 1600)

    project.budget.overrides = { [construction!.id]: 100 }
    const after = estimateBudget(project)
    const line = after.lines.find((item) => item.id === construction!.id)
    expect(line?.amount).toBe(100)
    expect(line?.source).toBe('quote')
    expect(after.byCategory.construction).toBe(100)
    expect(after.total).toBeCloseTo(before.total - construction!.amount + 100)
  })

  it('extras land in their own categories and in the total', () => {
    const project = createProject('Extras', 'house')
    project.budget.extras = [
      { id: 'crew', label: 'Crew', amount: 1000, kind: 'labour' },
      { id: 'permit', label: 'Permit', amount: 250, kind: 'fees' },
      { id: 'contingency', label: 'Contingency', amount: 75, kind: 'other' },
    ]
    const estimate = estimateBudget(project)
    expect(estimate.byCategory.labour).toBe(1000)
    expect(estimate.byCategory.fees).toBe(250)
    expect(estimate.byCategory.other).toBe(75)
    expect(estimate.total).toBe(1325)
    expect(estimate.lines.map((line) => line.category).sort()).toEqual(['fees', 'labour', 'other'])
  })

  it('variantBudgets prices the current design and a variant with one bigger room', () => {
    const project = room('Current', 4, 4)
    project.levels[0]!.items = []
    const bigger = variantFrom(project, 'Bigger', 'bigger', 1)
    bigger.levels[0]!.walls = []
    loop(bigger.levels[0]!, [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ])
    project.variants = [bigger]

    const rows = variantBudgets(project)
    expect(rows.map((row) => row.id)).toEqual(['current', 'bigger'])

    // 4×4 centre-line: construction 16×1600, oak floor 16×55, plaster both faces 16×2.7×2×18.
    const currentTotal = 16 * 1600 + 16 * 55 + 16 * 2.7 * 2 * 18
    // 6×4: construction 24×1600, floor 24×55, plaster 20×2.7×2×18.
    const biggerTotal = 24 * 1600 + 24 * 55 + 20 * 2.7 * 2 * 18
    const current = rows[0]!
    const variant = rows[1]!
    expect(current.total).toBeCloseTo(currentTotal)
    expect(current.byCategory.construction).toBeCloseTo(16 * 1600)
    expect(current.difference).toBe(0)
    expect(variant.total).toBeCloseTo(biggerTotal)
    expect(variant.byCategory.construction).toBeCloseTo(24 * 1600)
    expect(variant.difference).toBeCloseTo(biggerTotal - currentTotal)
  })

  it('loads a file saved before overrides and extras existed', () => {
    const project = createProject('Old', 'house')
    const parsed = JSON.parse(serialize(project)) as { budget: Record<string, unknown> }
    delete parsed.budget.overrides
    delete parsed.budget.extras
    const loaded = deserialize(JSON.stringify(parsed))
    expect(loaded.budget.overrides).toBeUndefined()
    expect(loaded.budget.extras).toBeUndefined()
    expect(estimateBudget(loaded).total).toBe(0)
  })
})
