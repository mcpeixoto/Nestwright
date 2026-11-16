import { describe, expect, it } from 'vitest'
import { fitScale } from '../../src/model/assetFit'

const box = { x: 2, y: 1, z: 0.5 }

describe('fitScale', () => {
  it('uniform keeps proportions, so a side ends up smaller than typed', () => {
    const scale = fitScale(box, { w: 1, d: 1, h: 1 }, 'uniform')
    expect(scale).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
    expect(box.z * scale.z).toBe(0.25)
  })

  it('an absent mode is uniform, as for every older import', () => {
    expect(fitScale(box, { w: 1, d: 1, h: 1 }, undefined)).toEqual(fitScale(box, { w: 1, d: 1, h: 1 }, 'uniform'))
  })

  it('stretch reaches the exact typed width, depth and height', () => {
    const size = { w: 1.8, d: 0.9, h: 0.75 }
    const scale = fitScale(box, size, 'stretch')
    expect(box.x * scale.x).toBeCloseTo(size.w, 9)
    expect(box.y * scale.y).toBeCloseTo(size.h, 9)
    expect(box.z * scale.z).toBeCloseTo(size.d, 9)
  })

  it('stays finite on a flat model', () => {
    const scale = fitScale({ x: 1, y: 0, z: 1 }, { w: 1, d: 1, h: 1 }, 'stretch')
    expect(Object.values(scale).every(Number.isFinite)).toBe(true)
  })
})
