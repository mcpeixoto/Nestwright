import { describe, expect, it } from 'vitest'
import { cloudLook, displayedSrgb, skyParams } from '../../src/view3d/atmosphere/skyParams'

const luma = (rgb: readonly number[]) => 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!

describe('cloud look', () => {
  it('shows fair-weather cumulus on a default clear day', () => {
    // A new project starts at cloudiness 0.15: the sky must not read as empty.
    const look = cloudLook('clear', 0.15)
    expect(look.coverage).toBeGreaterThan(0.2)
    expect(look.coverage).toBeLessThan(0.45)
    expect(look.density).toBeGreaterThan(0.8)
  })

  it('covers more of the sky as cloudiness rises, and nearly all of it in rain', () => {
    expect(cloudLook('clear', 0.8).coverage).toBeGreaterThan(cloudLook('clear', 0.1).coverage + 0.25)
    expect(cloudLook('rain', 0).coverage).toBeGreaterThan(0.8)
    expect(cloudLook('clear', Number.NaN).coverage).toBe(cloudLook('clear', 0).coverage)
  })

  it('lands lit tops near white and bases a cool grey at noon, through the tone mapper', () => {
    const noon = skyParams(1.05, 'clear', 0.15)
    const lit = displayedSrgb(noon.cloudLitScene, noon.exposure)
    const shade = displayedSrgb(noon.cloudShadeScene, noon.exposure)
    for (let i = 0; i < 3; i++) {
      expect(lit[i]).toBeCloseTo(noon.cloudLitDisplay[i]!, -0.5)
      expect(shade[i]).toBeCloseTo(noon.cloudShadeDisplay[i]!, -0.5)
    }
    expect(luma(lit)).toBeGreaterThan(235)
    // Shadowed bases read clearly darker than the tops, and bluish rather than yellow.
    expect(luma(shade)).toBeLessThan(luma(lit) - 50)
    expect(shade[2]).toBeGreaterThan(shade[0])
    // Clouds stand out from the sky behind them.
    expect(luma(lit)).toBeGreaterThan(luma(displayedSrgb(noon.zenithScene, noon.exposure)) + 80)
  })

  it('warms the tops at sunset, dims them at night, and greys them in rain', () => {
    const noon = skyParams(1.05, 'clear', 0.15)
    const dusk = skyParams(0.02, 'clear', 0.15)
    expect(dusk.cloudLitDisplay[0]).toBeGreaterThan(dusk.cloudLitDisplay[2] + 50)
    const night = skyParams(-0.4, 'clear', 0.15)
    expect(luma(night.cloudLitDisplay)).toBeLessThan(110)
    const rain = skyParams(1.05, 'rain', 0.5)
    expect(luma(rain.cloudLitDisplay)).toBeLessThan(luma(noon.cloudLitDisplay) - 30)
    expect(luma(rain.cloudShadeDisplay)).toBeLessThan(luma(noon.cloudShadeDisplay))
  })
})
