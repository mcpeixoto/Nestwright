import { describe, expect, it } from 'vitest'
import { getMaterialDef } from '../../src/materials/library'
import { distantGroundMode } from '../../src/view3d/layers/ground'
import { surroundOwns } from '../../src/view3d/terrain/surround'
import { LAWN_ALBEDO, lawnAlbedoAt } from '../../src/view3d/terrain/textures'

describe('distant ground', () => {
  it('keeps houses on a meadow and apartments on asphalt', () => {
    expect(distantGroundMode('house')).toBe('meadow')
    expect(distantGroundMode('apartment')).toBe('asphalt')
    expect(distantGroundMode(undefined)).toBe('meadow')
  })
})

describe('roof tiles', () => {
  it('uses warm terracotta courses, not a lilac square grid', () => {
    const def = getMaterialDef('roof-tiles')
    expect(def?.pattern.kind).toBe('courses')
    expect(def?.roughness).toBeGreaterThanOrEqual(0.75)
    expect(def?.metalness).toBe(0)
    expect(def?.tileSize).toBeGreaterThanOrEqual(1.4)
    const [first, second] = def?.pattern.colors ?? []
    for (const hex of [def?.color, first, second]) {
      const value = Number.parseInt((hex ?? '').slice(1), 16)
      const r = (value >> 16) & 255
      const g = (value >> 8) & 255
      const b = value & 255
      expect(r).toBeGreaterThan(140)
      expect(r).toBeGreaterThan(g)
      expect(r).toBeGreaterThan(b)
      expect(g).toBeGreaterThan(b)
    }
  })
})

describe('surround seam', () => {
  it('leaves the plot to the terrain mesh and keeps the lawn albedo stable', () => {
    expect(surroundOwns(0, 0, 40, 32)).toBe(false)
    expect(surroundOwns(19, 10, 40, 32)).toBe(false)
    expect(surroundOwns(21, 0, 40, 32)).toBe(true)
    expect(surroundOwns(0, 17, 40, 32)).toBe(true)
    const texel = lawnAlbedoAt(3.2, -1.4)
    expect(texel[1]).toBeGreaterThan(texel[0])
    expect(texel[0]).toBeGreaterThan(LAWN_ALBEDO.r - 5)
    expect(texel[0]).toBeLessThan(LAWN_ALBEDO.r + 30)
    expect(lawnAlbedoAt(3.2, -1.4)).toEqual(lawnAlbedoAt(3.2 + 1 / 0.07, -1.4))
  })
})
