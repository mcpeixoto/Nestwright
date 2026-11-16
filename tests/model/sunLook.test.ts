import { describe, expect, it } from 'vitest'
import {
  CLIMB_EXPOSURE_DROP,
  DAYLIGHT_EXPOSURE,
  NIGHT_EXPOSURE,
  SUN_HORIZON_INTENSITY,
  SUN_PEAK_INTENSITY,
  sunLook,
} from '../../src/model/sunLook'

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

  it('keeps a low afternoon sun and civil twilight bright enough to read', () => {
    const afternoon = sunLook((5 * Math.PI) / 180)
    const horizon = sunLook(0)
    const twilight = sunLook((-3 * Math.PI) / 180)
    const night = sunLook(-0.4)
    expect(afternoon.intensity).toBeGreaterThan(0.8)
    expect(afternoon.intensity).toBeLessThan(sunLook(0.5).intensity + 1e-6)
    expect(twilight.intensity).toBeGreaterThan(0.15)
    expect(twilight.intensity).toBeLessThan(horizon.intensity)
    expect(night.intensity).toBeLessThan(0.05)
    expect(afternoon.exposure).toBeCloseTo(
      NIGHT_EXPOSURE + afternoon.daylight * DAYLIGHT_EXPOSURE - afternoon.climb * CLIMB_EXPOSURE_DROP,
      6,
    )
  })

  it('peaks the sun at SUN_PEAK_INTENSITY and lowers the exposure only while the sun is up', () => {
    const noon = sunLook(1.2)
    expect(noon.climb).toBe(1)
    expect(noon.intensity).toBeCloseTo(SUN_PEAK_INTENSITY, 6)
    expect(noon.exposure).toBeCloseTo(NIGHT_EXPOSURE + DAYLIGHT_EXPOSURE - CLIMB_EXPOSURE_DROP, 6)
    for (const alt of [0, -0.05, -0.2, -0.6]) {
      const look = sunLook(alt)
      expect(look.climb).toBe(0)
      expect(look.exposure).toBeCloseTo(NIGHT_EXPOSURE + look.daylight * DAYLIGHT_EXPOSURE, 9)
    }
    expect(sunLook(0).intensity).toBeLessThanOrEqual(SUN_HORIZON_INTENSITY)
  })
})
