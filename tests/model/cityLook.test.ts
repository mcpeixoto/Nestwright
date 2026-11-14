import { describe, expect, it } from 'vitest'
import {
  ASPHALT_ROUGHNESS,
  GROUND_ENV_INTENSITY,
  PLAZA_TILE_M,
  SIDEWALK_ALBEDO_SRGB,
  STREET_ALBEDO_SRGB,
  URBAN_HAZE_SRGB,
  cityWindowsGlow,
  facadeLook,
  hash01,
  shellFacadeColor,
  shellGlowFraction,
  windowGlowFraction,
  windowIsLit,
} from '../../src/model/cityLook'
import { TWILIGHT_RAD } from '../../src/model/sunLook'

describe('city window glow', () => {
  it('stays dark through the day and civil twilight, then lights a 35–60% share at night', () => {
    const day = 0.6
    const twilight = (-3 * Math.PI) / 180
    const night = TWILIGHT_RAD - 0.02
    expect(cityWindowsGlow(day)).toBe(false)
    expect(cityWindowsGlow(0)).toBe(false)
    expect(cityWindowsGlow(twilight)).toBe(false)
    expect(cityWindowsGlow(TWILIGHT_RAD)).toBe(false)
    expect(cityWindowsGlow(night)).toBe(true)
    expect(cityWindowsGlow(Number.NaN)).toBe(false)

    for (let building = 0; building < 12; building++) {
      const fraction = windowGlowFraction(building)
      expect(fraction).toBeGreaterThanOrEqual(0.35)
      expect(fraction).toBeLessThanOrEqual(0.6)
      for (let cell = 0; cell < 40; cell++) {
        expect(windowIsLit(cell, building, day)).toBe(false)
        expect(windowIsLit(cell, building, twilight)).toBe(false)
        expect(windowIsLit(cell, building, TWILIGHT_RAD)).toBe(false)
        expect(windowIsLit(cell + 1000, building, night)).toBe(hash01(cell + 1000) < fraction)
      }
    }
  })
})

describe('city façades', () => {
  it('varies colour and window pattern, and keeps the unit shell light', () => {
    const looks = Array.from({ length: 8 }, (_, index) => facadeLook(index))
    expect(new Set(looks.map((look) => look.color.join(','))).size).toBe(8)
    expect(looks.some((look) => look.pattern === 'punched')).toBe(true)
    expect(looks.some((look) => look.pattern === 'ribbon')).toBe(true)
    expect(looks.some((look) => look.color[0] > 210 && look.color[0] > look.color[2])).toBe(true)
    expect(looks.some((look) => look.color[0] > look.color[1] + 40 && look.color[1] > look.color[2])).toBe(true)
    expect(looks.some((look) => look.color[0] < 130)).toBe(true)
    for (const look of looks) {
      expect(look.glow).toBeGreaterThanOrEqual(0.35)
      expect(look.glow).toBeLessThanOrEqual(0.6)
    }

    const shells = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const tone = shellFacadeColor(`project-${i}`)
      shells.add(tone.join(','))
      expect(Math.min(...tone)).toBeGreaterThan(180)
      expect(Math.max(...tone) - Math.min(...tone)).toBeLessThan(60)
      expect(shellGlowFraction(`project-${i}`)).toBeGreaterThanOrEqual(0.35)
      expect(shellGlowFraction(`project-${i}`)).toBeLessThanOrEqual(0.6)
    }
    expect(shells.size).toBe(3)
    expect(shellFacadeColor('project-1')).toEqual(shellFacadeColor('project-1'))
  })
})

describe('city ground', () => {
  it('keeps asphalt darker than sidewalk concrete, matte, and the haze blue rather than green', () => {
    for (const channel of STREET_ALBEDO_SRGB) {
      expect(channel).toBeGreaterThan(60)
      expect(channel).toBeLessThan(120)
    }
    for (const channel of SIDEWALK_ALBEDO_SRGB) {
      expect(channel).toBeGreaterThan(100)
      expect(channel).toBeLessThan(160)
    }
    expect(STREET_ALBEDO_SRGB[0]).toBeLessThan(SIDEWALK_ALBEDO_SRGB[0] - 20)
    expect(ASPHALT_ROUGHNESS).toBeGreaterThanOrEqual(0.9)
    expect(GROUND_ENV_INTENSITY).toBe(0)
    expect(PLAZA_TILE_M).toBeLessThanOrEqual(0.6)
    expect(PLAZA_TILE_M).toBeGreaterThan(0.05)
    expect(URBAN_HAZE_SRGB[2]).toBeGreaterThan(URBAN_HAZE_SRGB[1])
    expect(URBAN_HAZE_SRGB[1]).toBeGreaterThan(URBAN_HAZE_SRGB[0])
  })
})
