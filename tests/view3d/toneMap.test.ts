import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '../../src/settings'
import { NOON_ZENITH_SRGB, SUNSET_HORIZON_SRGB, displayedSrgb, skyParams } from '../../src/view3d/atmosphere/skyParams'
import {
  AGX_EXPOSURE_GAIN,
  acesFilmic,
  agx,
  rendererExposure,
  toneMap,
  toneMappingFor,
  tonePreference,
} from '../../src/view3d/atmosphere/toneMap'

const gamma = (v: number) => Math.pow(v, 1 / 2.2)

describe('tone mapping', () => {
  it('defaults to AgX, keeps ACES as a setting, and lets ?tone= override', () => {
    expect(normalizeSettings({}).toneMapping).toBe('agx')
    expect(normalizeSettings({ toneMapping: 'aces' }).toneMapping).toBe('aces')
    expect(normalizeSettings({ toneMapping: 'bogus' as never }).toneMapping).toBe('agx')
    expect(tonePreference('agx', '?tone=aces')).toBe('aces')
    expect(tonePreference('aces', '?renderer=webgl')).toBe('aces')
    expect(toneMappingFor('agx')).toBe(THREE.AgXToneMapping)
    expect(toneMappingFor('aces')).toBe(THREE.ACESFilmicToneMapping)
    expect(rendererExposure(1, 'aces')).toBe(1)
    expect(rendererExposure(1, 'agx')).toBe(AGX_EXPOSURE_GAIN)
  })

  it('AgX is monotonic, neutral on grey, and white-saturating', () => {
    let last = -1
    for (const x of [0, 0.01, 0.05, 0.18, 0.5, 1, 4, 16, 64]) {
      const [r, g, b] = agx([x, x, x], 1)
      expect(g).toBeGreaterThanOrEqual(last)
      expect(Math.abs(r - g)).toBeLessThan(0.01)
      expect(Math.abs(b - g)).toBeLessThan(0.01)
      last = g
    }
    expect(agx([1000, 1000, 1000], 1)[1]).toBeGreaterThan(0.95)
  })

  it('keeps day, sunset and night brightness close to the ACES look', () => {
    for (const exposure of [1.05, 0.75, 0.42]) {
      let sum = 0
      let n = 0
      for (const x of [0.05, 0.1, 0.18, 0.3, 0.5, 0.8, 1.2, 2]) {
        const a = gamma(acesFilmic([x, x, x], exposure)[1])
        const b = gamma(toneMap([x, x, x], exposure, 'agx')[1])
        expect(Math.abs(a - b)).toBeLessThan(0.12)
        sum += b - a
        n++
      }
      // Mean display brightness within 5% of the ACES look at every time of day.
      expect(Math.abs(sum / n)).toBeLessThan(0.05)
    }
  })

  it('inverts the sky through either curve onto the same display bytes', () => {
    for (const tone of ['agx', 'aces'] as const) {
      const noon = skyParams(1.05, 'clear', 0, undefined, tone)
      expect(noon.tone).toBe(tone)
      const shown = displayedSrgb(noon.zenithScene, noon.exposure, tone)
      for (let i = 0; i < 3; i++) expect(shown[i]).toBeCloseTo(NOON_ZENITH_SRGB[i]!, 0)
      const dusk = skyParams(0.08, 'clear', 0, undefined, tone)
      const horizon = displayedSrgb(dusk.horizonScene, dusk.exposure, tone)
      expect(Math.abs(horizon[0] - dusk.horizonDisplay[0])).toBeLessThan(1.5)
      expect(dusk.horizonDisplay[0]).toBeGreaterThan(SUNSET_HORIZON_SRGB[2])
    }
  })
})
