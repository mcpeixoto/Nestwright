import { describe, expect, it } from 'vitest'
import { convexPenetration, itemFootprint, OVERLAP_EPS, wallPieces } from '../../src/model/clearance'
import { createLevel, createWall } from '../../src/model/defaults'
import { resolveItemPose } from '../../src/model/itemCollision'
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

function pose(x: number, y: number, w: number, d: number, rotation = 0, h = 0.8) {
  return { position: { x, y }, rotation, size: { w, d, h }, elevation: 0, catalogId: 'chair' }
}

/** Deepest penetration of a pose into any wall piece or solid item of the level. */
function worstHit(level: Level, p: ReturnType<typeof pose>, ignore: string[] = []): number {
  const shape = itemFootprint(p)
  let worst = 0
  for (const piece of wallPieces(level)) worst = Math.max(worst, convexPenetration(shape, piece.polygon))
  for (const other of level.items) {
    if (ignore.includes(other.id)) continue
    worst = Math.max(worst, convexPenetration(shape, itemFootprint(other)))
  }
  return worst
}

describe('resolveItemPose', () => {
  it('pushes an item out of a straight wall along its normal', () => {
    const level = createLevel('Ground', 0)
    level.walls.push(createWall({ x: -5, y: 0 }, { x: 5, y: 0 }, { thickness: 0.2 }))
    const result = resolveItemPose(level, pose(0, 0.3, 1, 0.6))
    expect(result.blocked).toBe(false)
    expect(result.position.x).toBeCloseTo(0, 6)
    expect(result.position.y).toBeCloseTo(0.4, 6)
    expect(result.rotation).toBe(0)
  })

  it('settles in a corner between two walls', () => {
    const level = createLevel('Ground', 0)
    level.walls.push(
      createWall({ x: 0, y: 0 }, { x: 5, y: 0 }, { thickness: 0.2 }),
      createWall({ x: 0, y: 0 }, { x: 0, y: 5 }, { thickness: 0.2 }),
    )
    const result = resolveItemPose(level, pose(0.3, 0.35, 0.8, 0.8))
    expect(result.blocked).toBe(false)
    expect(result.position.x).toBeCloseTo(0.5, 6)
    expect(result.position.y).toBeCloseTo(0.5, 6)
    expect(worstHit(level, { ...pose(0, 0, 0.8, 0.8), position: result.position })).toBeLessThanOrEqual(OVERLAP_EPS)
  })

  it('pushes out of another item along the shortest axis', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('sofa', 0, 0, 2, 1))
    // Overlaps by 0.2 in x and 0.9 in y: the short way out is +x.
    const result = resolveItemPose(level, pose(1.3, 0.1, 1, 1))
    expect(result.blocked).toBe(false)
    expect(result.position.x).toBeCloseTo(1.5, 6)
    expect(result.position.y).toBeCloseTo(0.1, 6)
  })

  it('leaves a pose that does not penetrate anything unchanged', () => {
    const level = createLevel('Ground', 0)
    level.walls.push(createWall({ x: -5, y: 0 }, { x: 5, y: 0 }, { thickness: 0.2 }))
    level.items.push(item('sofa', 0, 2, 2, 1))
    const input = pose(0, 0.6, 1, 0.6)
    const result = resolveItemPose(level, input)
    expect(result.blocked).toBe(false)
    expect(result.moved).toBe(false)
    expect(result.position).toEqual(input.position)
  })

  it('leaves a flush (touching) pose alone', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('sofa', 0, 0, 2, 1))
    const result = resolveItemPose(level, pose(1.5, 0, 1, 1))
    expect(result.moved).toBe(false)
    expect(result.position).toEqual({ x: 1.5, y: 0 })
  })

  it('ignores flat items such as rugs', () => {
    const level = createLevel('Ground', 0)
    const rug = item('rug', 0, 0, 3, 2, 0, 0.02)
    rug.catalogId = 'rug-wool'
    level.items.push(rug)
    const result = resolveItemPose(level, pose(0.2, 0.1, 1, 1))
    expect(result.moved).toBe(false)
    expect(result.position).toEqual({ x: 0.2, y: 0.1 })
  })

  it('ignores items with no vertical overlap (stacked)', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('table', 0, 0, 1.2, 0.8, 0, 0.75))
    const lamp = { ...pose(0.1, 0, 0.3, 0.3, 0, 0.4), elevation: 0.75 }
    const result = resolveItemPose(level, lamp)
    expect(result.moved).toBe(false)
    expect(result.position).toEqual({ x: 0.1, y: 0 })
  })

  it('ignores items listed in ignore', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('self', 0, 0, 1, 1), item('other', 0.5, 0, 1, 1))
    const result = resolveItemPose(level, pose(0.1, 0, 1, 1), { ignore: ['self', 'other'] })
    expect(result.moved).toBe(false)
    const pushed = resolveItemPose(level, pose(0.1, 0, 1, 1), { ignore: ['self'] })
    expect(pushed.moved).toBe(true)
    expect(worstHit(level, { ...pose(0, 0, 1, 1), position: pushed.position }, ['self'])).toBeLessThanOrEqual(OVERLAP_EPS)
  })

  it('returns the input pose with the blocked flag when boxed in', () => {
    const level = createLevel('Ground', 0)
    // A 1 m wide corridor between two walls, a 1.2 m wide item cannot fit across it.
    level.walls.push(
      createWall({ x: -5, y: -0.6 }, { x: 5, y: -0.6 }, { thickness: 0.2 }),
      createWall({ x: -5, y: 0.6 }, { x: 5, y: 0.6 }, { thickness: 0.2 }),
    )
    const input = pose(0, 0.05, 1, 1.2)
    const result = resolveItemPose(level, input)
    expect(result.blocked).toBe(true)
    expect(result.position).toEqual(input.position)
    expect(result.rotation).toBe(input.rotation)
  })

  it('never pushes an item into a wall to escape furniture', () => {
    const level = createLevel('Ground', 0)
    level.walls.push(createWall({ x: -5, y: 0 }, { x: 5, y: 0 }, { thickness: 0.2 }))
    // Wall face at y = 0.1, sofa spans y 0.8..1.6. The box overlaps the sofa by 0.12 in y and
    // 0.2 in x; the shorter push (-y) would drive it 0.1 into the wall, so it goes -x instead.
    level.items.push(item('sofa', 0, 1.2, 2, 0.8))
    const result = resolveItemPose(level, pose(-1.2, 0.52, 0.8, 0.8))
    expect(result.blocked).toBe(false)
    expect(result.position.x).toBeCloseTo(-1.4, 6)
    expect(result.position.y).toBeCloseTo(0.52, 6)
    expect(worstHit(level, { ...pose(0, 0, 0.8, 0.8), position: result.position })).toBeLessThanOrEqual(OVERLAP_EPS)
  })

  it('resolves rotated (45°) footprints against walls and items', () => {
    const level = createLevel('Ground', 0)
    level.walls.push(createWall({ x: -5, y: 0 }, { x: 5, y: 0 }, { thickness: 0.2 }))
    level.items.push(item('crate', 2, 1, 1, 1, Math.PI / 4))
    const rot = Math.PI / 4
    const fromWall = resolveItemPose(level, pose(0, 0.5, 1, 1, rot))
    expect(fromWall.blocked).toBe(false)
    expect(fromWall.rotation).toBe(rot)
    // Half-diagonal of a unit square is √2 / 2; wall face is at y = 0.1.
    expect(fromWall.position.y).toBeCloseTo(0.1 + Math.SQRT1_2, 6)
    expect(fromWall.position.x).toBeCloseTo(0, 6)

    const fromItem = resolveItemPose(level, pose(2.9, 1.2, 1, 1, rot))
    expect(fromItem.blocked).toBe(false)
    expect(fromItem.rotation).toBe(rot)
    expect(worstHit(level, { ...pose(0, 0, 1, 1, rot), position: fromItem.position })).toBeLessThanOrEqual(OVERLAP_EPS)
  })
})
