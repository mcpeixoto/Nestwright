import { describe, expect, it } from 'vitest'
import { sunLook } from '../../src/model/sunLook'
import {
  CLEAR_FOG_NEAR,
  CLEAR_MIE,
  CLEAR_RAYLEIGH,
  NOON_HORIZON_SRGB,
  NOON_ZENITH_SRGB,
  displayedSrgb,
  skyParams,
} from '../../src/view3d/atmosphere/skyParams'
import { srgbByteToLinear, srgbHexToLinear } from '../../src/view3d/colorLinear'

describe('skyParams', () => {
  it('paints a blue-dominant noon zenith and a lighter horizon', () => {
    const noon = skyParams(1.05, 'clear', 0)
    expect(noon.zenithDisplay[2]).toBeGreaterThan(noon.zenithDisplay[1])
    expect(noon.zenithDisplay[1]).toBeGreaterThan(noon.zenithDisplay[0])
    expect(noon.horizonDisplay[2]).toBeGreaterThan(noon.horizonDisplay[0])
    expect(noon.horizonDisplay[0]).toBeGreaterThan(noon.zenithDisplay[0])
    expect(noon.rayleigh).toBeGreaterThan(1.5)
    expect(noon.mieCoefficient).toBeLessThan(0.004)
    expect(noon.turbidity).toBeLessThan(4)
    const shown = displayedSrgb(noon.zenithScene, noon.exposure)
    expect(shown[0]).toBeCloseTo(NOON_ZENITH_SRGB[0], 0)
    expect(shown[1]).toBeCloseTo(NOON_ZENITH_SRGB[1], 0)
    expect(shown[2]).toBeCloseTo(NOON_ZENITH_SRGB[2], 0)
    const horizon = displayedSrgb(noon.horizonScene, noon.exposure)
    expect(horizon[0]).toBeCloseTo(NOON_HORIZON_SRGB[0], 0)
    expect(horizon[1]).toBeCloseTo(NOON_HORIZON_SRGB[1], 0)
    expect(horizon[2]).toBeCloseTo(NOON_HORIZON_SRGB[2], 0)
    expect(noon.fogNear).toBe(CLEAR_FOG_NEAR)
    expect(noon.fogNear).toBeGreaterThan(80)
    expect(noon.exposure).toBeCloseTo(sunLook(1.05).exposure, 5)
    expect(noon.rayleigh).toBeCloseTo(CLEAR_RAYLEIGH, 5)
    expect(noon.mieCoefficient).toBeGreaterThan(0)
    expect(noon.mieCoefficient).toBeLessThan(CLEAR_MIE + 0.001)
  })

  it('turns warm at sunset and deep blue at night', () => {
    const dusk = skyParams(0.08, 'clear', 0.15)
    expect(dusk.horizonDisplay[0]).toBeGreaterThan(dusk.horizonDisplay[1])
    expect(dusk.horizonDisplay[1]).toBeGreaterThan(dusk.horizonDisplay[2])
    // Warm band low on the horizon, dusky blue overhead.
    expect(dusk.zenithDisplay[2]).toBeGreaterThan(dusk.zenithDisplay[0])
    expect(dusk.sunset).toBeGreaterThan(0.8)
    const night = skyParams(-0.35, 'clear', 0.1)
    expect(night.night).toBeGreaterThan(0.9)
    expect(night.zenithDisplay[2]).toBeGreaterThan(night.zenithDisplay[0])
    expect(night.star).toBeGreaterThan(0.5)
    expect(night.sunDisc).toBe(0)
    expect(night.zenithDisplay[0]).toBe(10)
    expect(night.zenithDisplay[1]).toBe(16)
    expect(night.zenithDisplay[2]).toBe(40)
    expect(night.horizonDisplay[2]).toBe(65)
    expect(night.hemiIntensity).toBeGreaterThan(0.8)
    expect(skyParams(1.05, 'clear', 0).hemiIntensity).toBe(0.8)
  })

  it('keeps civil twilight brighter than night', () => {
    const blue = skyParams((-3 * Math.PI) / 180, 'clear', 0)
    expect(blue.night).toBeLessThan(0.15)
    expect(blue.hemiIntensity).toBeGreaterThan(0.8)
    expect(blue.sunset).toBeGreaterThan(0.45)
    expect(blue.horizonDisplay[0]).toBeGreaterThan(blue.horizonDisplay[2])
  })
})

describe('srgb vertex colours', () => {
  it('stores a mid green darker than the sRGB fraction', () => {
    const linear = srgbHexToLinear(0x3f6b34)
    expect(linear[1]).toBeLessThan(0x6b / 255)
    expect(linear[1]).toBeGreaterThan(linear[0])
    expect(linear[1]).toBeGreaterThan(linear[2])
    expect(srgbByteToLinear(255)).toBeCloseTo(1, 5)
    expect(srgbByteToLinear(0)).toBe(0)
  })
})
