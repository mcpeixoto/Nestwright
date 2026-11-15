import { describe, expect, it } from 'vitest'
import {
  aspectSpread,
  axisSlope,
  fitKey,
  fitModel,
  fittedSize,
  mapAxis,
  sliceAxis,
  wantsLowLod,
  type ModelBounds,
} from '../../src/model/modelFit'

/** The sofa_02 model: 1.807 × 0.818 × 0.709 m, bottom-centre origin. */
const sofa: ModelBounds = { min: { x: -0.9035, y: 0, z: -0.409 }, max: { x: 0.9035, y: 0.709, z: 0.409 } }

describe('model fit', () => {
  it('scales uniformly to fit inside a box close to the model aspect', () => {
    const fit = fitModel(sofa, { w: 2.2, d: 0.9, h: 0.82 })
    expect(fit.kind).toBe('uniform')
    if (fit.kind !== 'uniform') return
    // Depth is the tight axis: 0.9 / 0.818.
    expect(fit.scale).toBeCloseTo(0.9 / 0.818, 4)
    const size = fittedSize(sofa, fit)
    expect(size.w).toBeLessThanOrEqual(2.2 + 1e-9)
    expect(size.d).toBeCloseTo(0.9, 6)
    expect(size.h).toBeLessThanOrEqual(0.82 + 1e-9)
  })

  it('centres the model and stands it on the floor', () => {
    const off: ModelBounds = { min: { x: 0.1, y: 0.05, z: -0.2 }, max: { x: 1.1, y: 1.05, z: 0.8 } }
    const fit = fitModel(off, { w: 2, d: 2, h: 2 })
    expect(fit.kind).toBe('uniform')
    if (fit.kind !== 'uniform') return
    expect(fit.scale).toBeCloseTo(2, 6)
    expect(fit.offset.x).toBeCloseTo(-1.2, 6)
    expect(fit.offset.y).toBeCloseTo(-0.1, 6)
    expect(fit.offset.z).toBeCloseTo(-0.6, 6)
  })

  it('switches to slicing past the aspect tolerance', () => {
    expect(aspectSpread({ w: 1.807, d: 0.818, h: 0.709 }, { w: 2.2, d: 0.9, h: 0.82 })).toBeLessThan(1.15)
    expect(aspectSpread({ w: 1.807, d: 0.818, h: 0.709 }, { w: 2.6, d: 0.9, h: 0.82 })).toBeGreaterThan(1.15)
    expect(fitModel(sofa, { w: 2.6, d: 0.9, h: 0.82 }).kind).toBe('slice')
  })

  it('keeps the arms of a stretched sofa at the uniform thickness', () => {
    const fit = fitModel(sofa, { w: 2.6, d: 0.9, h: 0.82 })
    expect(fit.kind).toBe('slice')
    if (fit.kind !== 'slice') return
    const scale = 0.9 / 0.818
    const arm = 1.807 * 0.15
    // The arm (outer 15%) scales like the uniform fit, not like the 2.6 / 1.807 stretch.
    const outerArm = mapAxis(fit.x, sofa.max.x) - mapAxis(fit.x, sofa.max.x - arm)
    expect(outerArm).toBeCloseTo(arm * scale, 6)
    const innerArm = mapAxis(fit.x, sofa.min.x + arm) - mapAxis(fit.x, sofa.min.x)
    expect(innerArm).toBeCloseTo(arm * scale, 6)
    // And the whole fills the box exactly, centred.
    expect(mapAxis(fit.x, sofa.min.x)).toBeCloseTo(-1.3, 6)
    expect(mapAxis(fit.x, sofa.max.x)).toBeCloseTo(1.3, 6)
    expect(mapAxis(fit.y, 0)).toBeCloseTo(0, 6)
    expect(mapAxis(fit.y, 0.709)).toBeCloseTo(0.82, 6)
    const size = fittedSize(sofa, fit)
    expect(size.w).toBeCloseTo(2.6, 6)
    expect(size.d).toBeCloseTo(0.9, 6)
    expect(size.h).toBeCloseTo(0.82, 6)
  })

  it('maps monotonically and reports the local slope', () => {
    const map = sliceAxis(-1, 1, -2, 2, 1)
    let last = -Infinity
    for (let v = -1; v <= 1.0001; v += 0.05) {
      const out = mapAxis(map, v)
      expect(out).toBeGreaterThan(last)
      last = out
    }
    expect(axisSlope(map, -0.95)).toBe(1)
    expect(axisSlope(map, 0)).toBeCloseTo((4 - 0.6) / 1.4, 6)
    expect(axisSlope(map, 0.95)).toBe(1)
  })

  it('falls back to a plain stretch when the box is shorter than the fixed ends', () => {
    const map = sliceAxis(0, 1, 0, 0.2, 1)
    expect(map.end).toBe(0)
    expect(mapAxis(map, 1)).toBeCloseTo(0.2, 6)
  })

  it('gives equal fits the same key and different fits different keys', () => {
    const a = fitKey(fitModel(sofa, { w: 2.2, d: 0.9, h: 0.82 }))
    const b = fitKey(fitModel(sofa, { w: 2.2, d: 0.9, h: 0.82 }))
    const c = fitKey(fitModel(sofa, { w: 2.6, d: 0.9, h: 0.82 }))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('ignores a non-positive target size on an axis', () => {
    const fit = fitModel(sofa, { w: 0, d: 0.818, h: 0.709 })
    expect(fit.kind).toBe('uniform')
    if (fit.kind === 'uniform') expect(fit.scale).toBeCloseTo(1, 6)
  })

  it('switches to LOD1 beyond 8 m, later for large models', () => {
    expect(wantsLowLod(7.9, 0.5)).toBe(false)
    expect(wantsLowLod(8.1, 0.5)).toBe(true)
    expect(wantsLowLod(12, 1)).toBe(false)
    expect(wantsLowLod(17, 1)).toBe(true)
  })
})
