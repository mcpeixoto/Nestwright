import { describe, expect, it } from 'vitest'
import { createLevel } from '../../src/model/defaults'
import { copyItems, parseItemClip, pasteItems, rotateItemGroup } from '../../src/model/itemClipboard'
import type { Item } from '../../src/model/types'

function item(id: string, x: number, y: number): Item {
  return { id, catalogId: 'chair', position: { x, y }, elevation: 0, rotation: 0, size: { w: 0.5, d: 0.5, h: 0.9 }, materials: { seat: { id: 'oak' } }, params: {} }
}

describe('item clipboard', () => {
  it('pastes copies with new ids around the target, keeping the layout', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('a', 1, 1), item('b', 3, 1), item('c', 9, 9))
    const clip = copyItems(level, ['a', 'b'])!
    const other = createLevel('First', 3)
    const ids = pasteItems(other, clip, { x: 10, y: 5 })
    expect(ids).toHaveLength(2)
    expect(ids.some((id) => id === 'a' || id === 'b')).toBe(false)
    expect(other.items.map((i) => i.position)).toEqual([{ x: 9, y: 5 }, { x: 11, y: 5 }])
    other.items[0]!.materials.seat!.id = 'walnut'
    expect(level.items[0]!.materials.seat!.id).toBe('oak')
  })

  it('round-trips through JSON and rejects other text', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('a', 1, 1))
    const clip = copyItems(level, ['a'])!
    expect(parseItemClip(JSON.stringify(clip))?.items).toHaveLength(1)
    expect(parseItemClip('hello')).toBeNull()
    expect(parseItemClip('{"kind":"other"}')).toBeNull()
  })

  it('turns a group about its centre', () => {
    const level = createLevel('Ground', 0)
    level.items.push(item('a', 0, 0), item('b', 2, 0))
    rotateItemGroup(level, ['a', 'b'], Math.PI / 2)
    expect(level.items[0]!.position.x).toBeCloseTo(1, 6)
    expect(level.items[0]!.position.y).toBeCloseTo(-1, 6)
    expect(level.items[1]!.position.y).toBeCloseTo(1, 6)
    expect(level.items[1]!.rotation).toBeCloseTo(Math.PI / 2, 6)
  })
})
