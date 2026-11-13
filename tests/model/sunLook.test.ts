import { describe, expect, it } from 'vitest'
import { sunLook } from '../../src/model/sunLook'

describe('sunLook', () => {
  it('warms and dims monotonically through dusk', () => {
    const altitudes = [0.46, 0.36, 0.26, 0.16, 0.08, 0.02]
    const looks = altitudes.map((altitude) => sunLook(altitude))
    for (let i = 1; i < looks.length; i++) {
      const prev = looks[i - 1]!
      const next = looks[i]!
      expect(next.warmth).toBeGreaterThanOrEqual(prev.warmth - 1e-6)
      expect(next.intensity).toBeLessThanOrEqual(prev.intensity + 1e-6)
      expect(next.b).toBeLessThanOrEqual(prev.b + 1e-6)
      expect(next.g).toBeLessThanOrEqual(prev.g + 1e-6)
    }
    expect(looks[0]!.warmth).toBeLessThan(looks[looks.length - 1]!.warmth)
    expect(looks[0]!.intensity).toBeGreaterThan(looks[looks.length - 1]!.intensity)
  })

  it('keeps the night readable and the moon brighter than the sun below the horizon', () => {
    const night = sunLook(-0.4)
    const day = sunLook(0.8)
    expect(night.intensity).toBeLessThan(0.05)
    expect(night.moon).toBeGreaterThan(night.intensity)
    expect(night.exposure).toBeGreaterThan(0.2)
    expect(night.exposure).toBeLessThan(day.exposure)
    expect(day.daylight).toBeGreaterThan(0.9)
  })
})
