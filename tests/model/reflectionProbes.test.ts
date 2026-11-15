import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../../src/model/geometry'
import {
  chooseReflectionSlot,
  REFLECTION_EYE,
  REFLECTION_INSET,
  REFLECTION_TIERS,
  reflectionKey,
  reflectionOrigin,
  reflectionTier,
  roomReflectionBox,
} from '../../src/model/reflectionProbes'

const level = { elevation: 3, height: 2.8 }
const rect = { polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], centroid: { x: 3, y: 2 }, key: 'r1' }
// An L: the centroid of its vertices falls in the notch.
const ell = {
  polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 6 }, { x: 0, y: 6 }],
  centroid: { x: 2, y: 2 },
  key: 'r2',
}

describe('reflection tiers', () => {
  it('keeps a fixed pool per tier and none on Low', () => {
    expect(reflectionTier('low')).toBeNull()
    expect(reflectionTier('nonsense')).toBeNull()
    expect(reflectionTier('medium')?.slots).toBe(1)
    expect(reflectionTier('high')?.slots).toBe(2)
    expect(reflectionTier('ultra')?.slots).toBe(4)
    for (const tier of Object.values(REFLECTION_TIERS)) {
      // A face per frame at least, all six within a few frames, never more than one cube at once.
      expect(tier.facesPerFrame).toBeGreaterThanOrEqual(1)
      expect(tier.freshFacesPerFrame).toBeGreaterThanOrEqual(tier.facesPerFrame)
      expect(tier.freshFacesPerFrame).toBeLessThanOrEqual(6)
      expect(Math.log2(tier.faceSize) % 1).toBe(0)
    }
  })
})

describe('roomReflectionBox', () => {
  it('spans the room inside its walls, floor to ceiling, in world axes (z = plan y)', () => {
    const box = roomReflectionBox(rect, level)
    expect(box).toEqual({
      min: { x: REFLECTION_INSET, y: 3, z: REFLECTION_INSET },
      max: { x: 6 - REFLECTION_INSET, y: 5.8, z: 4 - REFLECTION_INSET },
    })
  })

  it('does not invert a sliver of a room and refuses a degenerate one', () => {
    const thin = { polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0.2 }, { x: 0, y: 0.2 }] }
    const box = roomReflectionBox(thin, level)
    expect(box && box.max.z).toBeGreaterThan(box?.min.z ?? Infinity)
    expect(roomReflectionBox({ polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, level)).toBeNull()
  })

  it('falls back to a 3 m storey when the level has no height', () => {
    expect(roomReflectionBox(rect, { elevation: 0, height: 0 })?.max.y).toBe(3)
  })
})

describe('reflectionOrigin', () => {
  it('captures from the centroid at eye height above the floor', () => {
    expect(reflectionOrigin(rect, level)).toEqual({ x: 3, y: 3 + REFLECTION_EYE, z: 2 })
  })

  it('stays under a low ceiling', () => {
    expect(reflectionOrigin(rect, { elevation: 0, height: 1.5 }).y).toBeCloseTo(1.3, 9)
  })

  it('moves a centroid that falls outside an L-shaped room to the nearest inside point', () => {
    const o = reflectionOrigin(ell, level)
    expect(pointInPolygon({ x: o.x, y: o.z }, ell.polygon)).toBe(true)
    expect(Math.hypot(o.x - 2, o.z - 2)).toBeLessThan(1.5)
  })
})

describe('chooseReflectionSlot', () => {
  it('reuses the slot holding the room, then an empty one, then the least recently used', () => {
    expect(reflectionKey('L1', rect)).toBe('L1|r1')
    expect(chooseReflectionSlot([], 'a')).toBe(-1)
    expect(chooseReflectionSlot([{ key: 'b', used: 5 }, { key: 'a', used: 1 }], 'a')).toBe(1)
    expect(chooseReflectionSlot([{ key: 'b', used: 5 }, { key: null, used: 0 }], 'a')).toBe(1)
    expect(chooseReflectionSlot([{ key: 'b', used: 5 }, { key: 'c', used: 2 }, { key: 'd', used: 9 }], 'a')).toBe(1)
  })

  it('never evicts the capture on show while another slot can take the room', () => {
    expect(chooseReflectionSlot([{ key: 'b', used: 1 }, { key: 'c', used: 5 }], 'a', 0)).toBe(1)
    // A single slot (Medium) has no choice: the room on show goes back to the sky until the new one lands.
    expect(chooseReflectionSlot([{ key: 'b', used: 1 }], 'a', 0)).toBe(0)
  })
})
