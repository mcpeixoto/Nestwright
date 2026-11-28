import { describe, expect, it } from 'vitest'
import { createOpening, createWall, mat } from '../../src/model/defaults'
import { diffWalls } from '../../src/view3d/wallDiff'

function square() {
  return [
    createWall({ x: 0, y: 0 }, { x: 4, y: 0 }),
    createWall({ x: 4, y: 0 }, { x: 4, y: 4 }),
    createWall({ x: 4, y: 4 }, { x: 0, y: 4 }),
    createWall({ x: 0, y: 4 }, { x: 0, y: 0 }),
  ]
}
const ids = (...list: { id: string }[]) => list.map((w) => w.id).sort()

describe('diffWalls', () => {
  it('rebuilds everything on first sync', () => {
    const d = diffWalls(undefined, square(), undefined, [])
    expect(d.rebuild.length).toBe(4)
    expect(d.floors).toBe(true)
  })

  it('rebuilds only the moved wall and its two joint neighbours', () => {
    const walls = square()
    const next = [{ ...walls[0], b: { x: 4, y: 0.1 } }, walls[1], walls[2], walls[3]]
    const d = diffWalls(walls, next, [], [])
    expect(d.rebuild).toEqual(ids(walls[0], walls[1], walls[3]))
    expect(d.remove).toEqual([])
    expect(d.floors).toBe(true)
  })

  it('a material change rebuilds the wall but not the floors or neighbours', () => {
    const walls = square()
    const next = [{ ...walls[0], left: mat('brick-red') }, walls[1], walls[2], walls[3]]
    const d = diffWalls(walls, next, [], [])
    expect(d.rebuild).toEqual([walls[0].id])
    expect(d.floors).toBe(false)
  })

  it('an opening change rebuilds only its wall', () => {
    const walls = square()
    const door = createOpening('door', walls[2].id, 1)
    const d = diffWalls(walls, walls, [door], [{ ...door, offset: 2 }])
    expect(d.rebuild).toEqual([walls[2].id])
    expect(d.floors).toBe(false)
  })

  it('a removed wall rebuilds its former neighbours', () => {
    const walls = square()
    const d = diffWalls(walls, [walls[0], walls[1], walls[3]], [], [])
    expect(d.remove).toEqual([walls[2].id])
    expect(d.rebuild).toEqual(ids(walls[1], walls[3]))
    expect(d.floors).toBe(true)
  })

  it('identical arrays produce an empty diff', () => {
    const walls = square()
    const openings = [createOpening('window', walls[0].id, 2)]
    expect(diffWalls(walls, walls, openings, openings)).toEqual({ rebuild: [], remove: [], floors: false })
  })
})
