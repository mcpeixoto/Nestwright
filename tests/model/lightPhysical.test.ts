import { describe, expect, it } from 'vitest'
import {
  clampLumens,
  kelvinToLinear,
  KELVIN_MAX,
  KELVIN_MIN,
  lampOutput,
  pointCandela,
  spotCandela,
} from '../../src/model/light'

const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('kelvinToLinear', () => {
  it('has luminance 1 across 1000–10000 K', () => {
    for (let k = 1000; k <= 10000; k += 250) {
      const rgb = kelvinToLinear(k)
      expect(luminance(rgb)).toBeCloseTo(1, 6)
      for (const c of rgb) {
        expect(Number.isFinite(c)).toBe(true)
        expect(c).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('gets bluer and less red as it gets hotter', () => {
    let prev = kelvinToLinear(1000)
    for (let k = 1250; k <= 10000; k += 250) {
      const next = kelvinToLinear(k)
      // Blue clips to 0 below ~1900 K, so the ratio only has to rise once blue appears.
      if (next[2] > 0) expect(next[2] / next[0]).toBeGreaterThan(prev[2] / prev[0])
      else expect(prev[2]).toBe(0)
      expect(next[0]).toBeLessThanOrEqual(prev[0] + 1e-9)
      prev = next
    }
  })

  it('is near-white around 6500 K and warm at lamp temperatures', () => {
    const d65 = kelvinToLinear(6500)
    for (const c of d65) expect(Math.abs(c - 1)).toBeLessThan(0.12)
    const lamp = kelvinToLinear(2700)
    expect(lamp[0]).toBeGreaterThan(lamp[1])
    expect(lamp[1]).toBeGreaterThan(lamp[2])
    // Linear, not gamma: a 2700 K lamp is about (1, 0.42, 0.10) relative to red.
    expect(lamp[2] / lamp[0]).toBeGreaterThan(0.06)
    expect(lamp[2] / lamp[0]).toBeLessThan(0.15)
    expect(lamp[1] / lamp[0]).toBeGreaterThan(0.35)
    expect(lamp[1] / lamp[0]).toBeLessThan(0.5)
    expect(kelvinToLinear(1000)[2]).toBeLessThan(0.02)
    expect(kelvinToLinear(10000)[2]).toBeGreaterThan(kelvinToLinear(10000)[0])
  })

  it('clamps out-of-range and non-finite input', () => {
    expect(kelvinToLinear(200)).toEqual(kelvinToLinear(KELVIN_MIN))
    expect(kelvinToLinear(40000)).toEqual(kelvinToLinear(KELVIN_MAX))
    expect(kelvinToLinear(Number.NaN)).toEqual(kelvinToLinear(2700))
  })
})

describe('lamp photometry', () => {
  it('turns lumens into candela for points and spots', () => {
    expect(pointCandela(4 * Math.PI * 100)).toBeCloseTo(100, 9)
    expect(pointCandela(-5)).toBe(0)
    // A hemisphere cone (90°) spreads over 2π sr.
    expect(spotCandela(2 * Math.PI * 50, Math.PI / 2)).toBeCloseTo(50, 9)
    // Narrower cone, same lumens: brighter on axis.
    expect(spotCandela(400, 0.3)).toBeGreaterThan(spotCandela(400, 0.6))
    expect(spotCandela(400, 0.6)).toBeGreaterThan(pointCandela(400))
  })

  it('reads lamp fields, then pre-0.7 params, then the catalog default', () => {
    const spec = { lumens: 800, kelvin: 2700, intensity: 40 }
    expect(lampOutput({}, spec)).toEqual({ lumens: 800, kelvin: 2700 })
    expect(lampOutput({ params: { intensity: 20, kelvin: 3500 } }, spec)).toEqual({ lumens: 400, kelvin: 3500 })
    expect(lampOutput({ lumens: 1500, kelvin: 4000, params: { intensity: 20, kelvin: 3500 } }, spec)).toEqual({
      lumens: 1500,
      kelvin: 4000,
    })
    expect(lampOutput({ lumens: 1e9 }, spec).lumens).toBe(clampLumens(1e9))
    expect(clampLumens(Number.NaN)).toBe(800)
  })
})
