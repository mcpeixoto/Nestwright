import { describe, expect, it } from 'vitest'
import { skyParams } from '../../src/view3d/atmosphere/skyParams'

const luma = (rgb: readonly number[]) => 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!

describe('environment ground bounce', () => {
  it('lights from below with dim, warm ground, not the bright blue horizon', () => {
    // The environment map lights every shaded face. Its lower half used to repeat the sky's
    // horizon colour, so walls and shadows took bright sky-blue light from the ground.
    const noon = skyParams(1.05, 'clear', 0.15)
    expect(luma(noon.groundLight)).toBeLessThan(luma(noon.horizonLight) * 0.45)
    expect(luma(noon.groundLight)).toBeGreaterThan(luma(noon.horizonLight) * 0.12)
    expect(noon.groundLight[0]).toBeGreaterThan(noon.groundLight[2])
  })

  it('dims the ground with the daylight', () => {
    const noon = skyParams(1.05, 'clear', 0.15)
    const dusk = skyParams(0.02, 'clear', 0.15)
    const night = skyParams(-0.4, 'clear', 0.15)
    expect(luma(dusk.groundLight)).toBeLessThan(luma(noon.groundLight))
    expect(luma(night.groundLight)).toBeLessThan(luma(dusk.groundLight))
    expect(luma(night.groundLight)).toBeLessThan(0.01)
  })
})
