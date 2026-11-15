import { describe, expect, it } from 'vitest'
import { createLevel, createWall } from '../../src/model/defaults'
import { snapItemPose, WALL_SNAP_DISTANCE } from '../../src/model/furnitureSnap'
import type { Item, Level } from '../../src/model/types'

function item(id: string, x: number, y: number, w: number, d: number, rotation = 0): Item {
  return {
    id,
    catalogId: 'sofa',
    position: { x, y },
    elevation: 0,
    rotation,
    size: { w, d, h: 0.8 },
    materials: {},
    params: {},
  }
}

function room(): Level {
  const level = createLevel('Ground', 0)
  level.walls.push(createWall({ x: 0, y: 0 }, { x: 6, y: 0 }, { thickness: 0.2 }))
  return level
}

describe('furniture snap', () => {
  it('pushes the back edge flush to the wall face and squares the rotation', () => {
    const level = room()
    const pose = item('a', 3, 0.1 + 0.25 + 0.1, 1, 0.5, 0.2)
    const out = snapItemPose(level, pose)
    expect(out.position.y).toBeCloseTo(0.35, 6)
    expect(out.position.x).toBeCloseTo(3, 6)
    expect(out.rotation).toBeCloseTo(0, 6)
    expect(out.wallId).toBe(level.walls[0]!.id)
    expect(out.guides.some((g) => g.kind === 'wall')).toBe(true)
  })

  it('faces away from the wall when on the other side', () => {
    const level = room()
    const out = snapItemPose(level, item('a', 3, -0.42, 1, 0.5, Math.PI - 0.1))
    expect(out.position.y).toBeCloseTo(-0.35, 6)
    expect(Math.abs(Math.cos(out.rotation) + 1)).toBeLessThan(1e-6)
  })

  it('does nothing beyond the threshold or past the angle limit', () => {
    const level = room()
    const far = item('a', 3, 0.1 + 0.25 + WALL_SNAP_DISTANCE + 0.05, 1, 0.5)
    expect(snapItemPose(level, far).position).toEqual(far.position)
    const turned = item('a', 3, 0.4, 1, 0.5, (35 * Math.PI) / 180)
    const out = snapItemPose(level, turned)
    expect(out.position).toEqual(turned.position)
    expect(out.rotation).toBe(turned.rotation)
  })

  it('lines edges up with a neighbour', () => {
    const level = room()
    level.items.push(item('b', 3, 2, 1, 0.5))
    const out = snapItemPose(level, item('a', 4.05, 2.03, 1, 0.5), { ignore: ['a'] })
    expect(out.position.x).toBeCloseTo(4, 6)
    expect(out.position.y).toBeCloseTo(2, 6)
    expect(out.neighbourId).toBe('b')
    expect(out.guides.filter((g) => g.kind === 'item').length).toBe(2)
  })

  it('leaves the pose alone with snapping off (Alt)', () => {
    const level = room()
    level.items.push(item('b', 3, 2, 1, 0.5))
    const near = item('a', 3, 0.42, 1, 0.5, 0.1)
    const out = snapItemPose(level, near, { snap: false })
    expect(out.position).toEqual(near.position)
    expect(out.rotation).toBe(0.1)
    expect(out.guides).toEqual([])
  })

  it('keeps the rotation for group drags', () => {
    const level = room()
    const out = snapItemPose(level, item('a', 3, 0.42, 1, 0.5, 0.2), { rotate: false })
    expect(out.position.y).toBeCloseTo(0.42, 6)
    const square = snapItemPose(level, item('a', 3, 0.42, 1, 0.5, 0), { rotate: false })
    expect(square.position.y).toBeCloseTo(0.35, 6)
  })
})
