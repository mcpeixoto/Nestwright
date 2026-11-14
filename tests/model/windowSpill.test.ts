import { describe, expect, it } from 'vitest'
import type { Level, Opening, Wall } from '../../src/model/types'
import { exteriorWindowSpills } from '../../src/model/windowSpill'

function wall(id: string, ax: number, ay: number, bx: number, by: number): Wall {
  return {
    id,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness: 0.2,
    height: 2.7,
    bulge: 0,
    left: { id: 'plaster-white' },
    right: { id: 'plaster-white' },
  }
}

function opening(wallId: string, type: Opening['type'], offset: number, sill = 0.9): Opening {
  return {
    id: `${wallId}-open`,
    wallId,
    type,
    offset,
    width: 1.2,
    height: 1.4,
    sill,
    frame: { id: 'plaster-white' },
  }
}

function level(walls: Wall[], openings: Opening[], elevation = 0): Level {
  return {
    id: 'ground',
    name: 'Ground',
    elevation,
    height: 2.7,
    slabThickness: 0.2,
    walls,
    openings,
    rooms: [],
    stairs: [],
    roofs: [],
    columns: [],
    slabs: [],
    items: [],
    dimensions: [],
  }
}

describe('exterior window spills', () => {
  it('puts a lamp outside a ground-floor window and skips the storey above', () => {
    const walls = [
      wall('s', -4, -3, 4, -3),
      wall('e', 4, -3, 4, 3),
      wall('n', 4, 3, -4, 3),
      wall('w', -4, 3, -4, -3),
    ]
    const spills = exteriorWindowSpills(
      level(walls, [opening('s', 'window', 4), opening('n', 'door', 4, 0)]),
    )
    expect(spills).toHaveLength(1)
    const lamp = spills[0]!
    expect(lamp.z).toBeLessThan(-3)
    expect(lamp.y).toBeGreaterThan(0.8)
    expect(lamp.y).toBeLessThan(2.2)
    expect(exteriorWindowSpills(level(walls, [opening('s', 'window', 4)], 2.8))).toEqual([])
  })
})
