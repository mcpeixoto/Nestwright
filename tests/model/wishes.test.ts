import { describe, expect, it } from 'vitest'
import { createLevel, createProject, createWall } from '../../src/model/defaults'
import { detectRooms } from '../../src/model/rooms'
import type { Level, Vec2, Wish } from '../../src/model/types'
import {
  describeTarget,
  disagreements,
  groupWishes,
  targetFromSelection,
  wishAnchor,
  wishTargetKey,
} from '../../src/model/wishes'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

function wish(partial: Partial<Wish> & Pick<Wish, 'author' | 'reaction' | 'target'>): Wish {
  return {
    id: partial.id ?? partial.author + partial.reaction,
    author: partial.author,
    target: partial.target,
    reaction: partial.reaction,
    note: partial.note ?? '',
    createdAt: partial.createdAt ?? 1,
    resolved: partial.resolved,
  }
}

describe('wishes', () => {
  it('flags a love and a no from different people, and ignores a settled one', () => {
    const target = { kind: 'item' as const, id: 'sofa' }
    const open = [
      wish({ author: 'Ada', reaction: 'love', target }),
      wish({ author: 'Bea', reaction: 'no', target, note: 'Too big' }),
      wish({ author: 'Ada', reaction: 'love', target: { kind: 'item', id: 'lamp' } }),
      wish({ author: 'Ada', reaction: 'no', target: { kind: 'item', id: 'lamp' } }),
    ]
    const found = disagreements(open)
    expect(found).toHaveLength(1)
    expect(found[0]?.key).toBe(wishTargetKey(open[0]!))
    expect(found[0]?.loves).toHaveLength(1)
    expect(found[0]?.nos[0]?.note).toBe('Too big')

    const settled = wish({ author: 'Bea', reaction: 'no', target, resolved: true })
    expect(disagreements([open[0]!, settled])).toHaveLength(0)
  })

  it('groups a pin by the room it sits in', () => {
    const project = createProject('Home', 'house')
    const level = project.levels[0]!
    loop(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    const room = detectRooms(level)[0]!
    level.rooms.push({ key: room.key, name: 'Kitchen', type: 'kitchen', floor: { id: 'oak-planks' }, ceiling: { id: 'plaster-white' } })
    const pin = wish({
      author: 'Ada',
      reaction: 'idea',
      target: { kind: 'point', levelId: level.id, at: { x: 2, y: 2 } },
      note: 'Table here',
    })
    const groups = groupWishes(project, [pin])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('Kitchen')
    expect(describeTarget(project, pin)).toBe('Point on Ground')
    const anchor = wishAnchor(project, pin)
    expect(anchor?.x).toBeCloseTo(2)
    expect(anchor?.z).toBeCloseTo(2)
    expect(anchor?.y).toBeCloseTo(level.elevation + 1.2)
  })

  it('targets the selection or the plan point', () => {
    const level = createLevel('G', 0)
    loop(level, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ])
    const room = detectRooms(level)[0]!
    level.items.push({
      id: 'chair',
      catalogId: 'sofa-2',
      position: { x: 1, y: 1 },
      elevation: 0,
      rotation: 0,
      size: { w: 1, d: 1, h: 1 },
      materials: {},
      params: {},
    })
    expect(targetFromSelection(level, [room], ['chair'], null, 'selection')).toEqual({ kind: 'item', id: 'chair' })
    expect(targetFromSelection(level, [room], room.key.split(','), null, 'selection')).toEqual({ kind: 'room', key: room.key })
    expect(targetFromSelection(level, [room], [], { x: 1, y: 1 }, 'point')).toEqual({ kind: 'room', key: room.key })
    expect(targetFromSelection(level, [room], [], { x: 9, y: 9 }, 'point')).toEqual({
      kind: 'point',
      levelId: level.id,
      at: { x: 9, y: 9 },
    })
    expect(targetFromSelection(level, [room], ['missing'], null, 'selection')).toBeNull()
  })
})
