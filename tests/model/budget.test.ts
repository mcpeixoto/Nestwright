import { describe, expect, it } from 'vitest'
import '../../src/catalog'
import { getEntry } from '../../src/catalog/registry'
import { createOpening, createProject, createWall } from '../../src/model/defaults'
import {
  FENCE_COST_PER_M,
  OPENING_PRICES,
  POOL_COST_PER_M2,
  estimateBudget,
} from '../../src/model/budget'
import { detectRooms } from '../../src/model/rooms'
import type { Level, Vec2 } from '../../src/model/types'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

function kitchen() {
  const project = createProject('Cost', 'house')
  const level = project.levels[0]!
  loop(level, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ])
  const room = detectRooms(level)[0]!
  level.rooms.push({
    key: room.key,
    name: 'Kitchen',
    type: 'kitchen',
    floor: { id: 'oak-planks' },
    ceiling: { id: 'plaster-white' },
  })
  const wall = level.walls[0]!
  level.openings.push(createOpening('door', wall.id, 2))
  level.items.push({
    id: 'table',
    catalogId: 'sofa-2',
    position: { x: 2, y: 2 },
    elevation: 0,
    rotation: 0,
    size: { w: 1, d: 1, h: 0.8 },
    materials: {},
    params: {},
    price: 500,
  })
  project.terrain.water.push({
    id: 'pond',
    kind: 'pond',
    polygon: [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 3 },
    ],
    level: 0,
  })
  project.terrain.water.push({
    id: 'pool',
    kind: 'pool',
    polygon: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ],
    level: 0,
  })
  project.terrain.fences.push({ id: 'fence', style: 'picket', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], height: 1 })
  return project
}

describe('estimateBudget', () => {
  it('prices construction, finishes, a door, an item, a pool and a fence', () => {
    const project = kitchen()
    const estimate = estimateBudget(project)
    const net = 16 * 2.7 - 0.9 * 2.1
    const terrain = 4 * POOL_COST_PER_M2 + 5 * FENCE_COST_PER_M
    expect(estimate.currency).toBe('EUR')
    expect(estimate.byCategory.construction).toBeCloseTo(16 * 1600)
    expect(estimate.byCategory.finishes).toBeCloseTo(net * 18 * 2 + 16 * 55)
    expect(estimate.byCategory.openings).toBe(OPENING_PRICES.door)
    expect(estimate.byCategory.items).toBe(500)
    expect(estimate.byCategory.terrain).toBeCloseTo(terrain)
    const total =
      estimate.byCategory.construction +
      estimate.byCategory.finishes +
      estimate.byCategory.openings +
      estimate.byCategory.items +
      estimate.byCategory.terrain
    expect(estimate.total).toBeCloseTo(total)
    const kitchenTotal = estimate.byRoom.find((room) => room.name === 'Kitchen')
    const outside = estimate.byRoom.find((room) => room.name === 'Outside')
    expect(kitchenTotal?.total).toBeCloseTo(16 * 1600 + net * 18 + 16 * 55 + OPENING_PRICES.door + 500)
    expect(outside?.total).toBeCloseTo(net * 18 + terrain)
    expect(estimate.target).toBeNull()
    project.budget.target = 40000
    expect(estimateBudget(project).delta).toBeCloseTo(40000 - estimate.total)
  })

  it('lets a finish override replace the library price and falls back to the catalog', () => {
    const project = kitchen()
    project.budget.finishCostPerM2['oak-planks'] = 10
    const net = 16 * 2.7 - 0.9 * 2.1
    expect(estimateBudget(project).byCategory.finishes).toBeCloseTo(net * 18 * 2 + 16 * 10)

    project.levels[0]!.items[0]!.price = undefined
    const priced = estimateBudget(project)
    expect(priced.byCategory.items).toBe(getEntry('sofa-2')?.price ?? 0)
    expect(priced.byCategory.items).toBeGreaterThan(0)
  })

  it('stays at zero for an empty project', () => {
    const estimate = estimateBudget(createProject('Empty', 'house'))
    expect(estimate.total).toBe(0)
    expect(estimate.byRoom).toHaveLength(0)
  })
})
