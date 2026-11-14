import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  pixelRatioCap,
  plantDensityMultiplier,
  shadowMapSize,
  type Settings,
} from '../../src/settings'
import { effectiveRenderScale, qualityProfile, renderPixelRatio } from '../../src/view3d/render/quality'

describe('renderer settings', () => {
  it('defaults to automatic backend, tier render scale and manual tier', () => {
    expect(DEFAULT_SETTINGS.backend).toBe('auto')
    expect(DEFAULT_SETTINGS.renderScale).toBe(0)
    expect(DEFAULT_SETTINGS.qualityAuto).toBe(false)
    const settings = normalizeSettings({})
    expect(settings.backend).toBe('auto')
    expect(settings.renderScale).toBe(0)
    expect(settings.qualityAuto).toBe(false)
  })

  it('keeps known backends and drops unknown ones', () => {
    expect(normalizeSettings({ backend: 'webgl' }).backend).toBe('webgl')
    expect(normalizeSettings({ backend: 'webgpu' }).backend).toBe('webgpu')
    expect(normalizeSettings({ backend: 'vulkan' } as unknown as Partial<Settings>).backend).toBe('auto')
  })

  it('clamps render scale and treats junk as "follow the tier"', () => {
    expect(normalizeSettings({ renderScale: 2 }).renderScale).toBe(1)
    expect(normalizeSettings({ renderScale: 0.1 }).renderScale).toBe(0.25)
    expect(normalizeSettings({ renderScale: 0.67 }).renderScale).toBe(0.67)
    expect(normalizeSettings({ renderScale: -1 }).renderScale).toBe(0)
    expect(normalizeSettings({ renderScale: Number.NaN }).renderScale).toBe(0)
    expect(normalizeSettings({ renderScale: '0.5' } as unknown as Partial<Settings>).renderScale).toBe(0)
  })

  it('only accepts a literal true for qualityAuto', () => {
    expect(normalizeSettings({ qualityAuto: true }).qualityAuto).toBe(true)
    expect(normalizeSettings({ qualityAuto: 'yes' } as unknown as Partial<Settings>).qualityAuto).toBe(false)
  })
})

describe('quality profiles', () => {
  it('scales render resolution and lamp shadows by tier', () => {
    expect(['low', 'medium', 'high', 'ultra'].map((t) => qualityProfile(t as never).renderScale)).toEqual([0.5, 0.67, 0.8, 1])
    expect(['low', 'medium', 'high', 'ultra'].map((t) => qualityProfile(t as never).lampShadowSlots)).toEqual([2, 4, 4, 4])
    expect(qualityProfile('low').effects.fxaa).toBe(true)
    expect(qualityProfile('low').effects.bloom).toBe(false)
    expect(qualityProfile('ultra').effects.ssgi).toBe(true)
  })

  it('keeps the old helpers as wrappers', () => {
    expect(shadowMapSize('low')).toBe(512)
    expect(shadowMapSize('medium')).toBe(1024)
    expect(shadowMapSize('high')).toBe(2048)
    expect(pixelRatioCap('low')).toBe(1)
    expect(pixelRatioCap('medium')).toBe(1.5)
    expect(plantDensityMultiplier('low')).toBe(0.35)
    expect(plantDensityMultiplier('ultra')).toBe(1.35)
  })

  it('renders at CSS × devicePixelRatio × render scale', () => {
    expect(renderPixelRatio(2, 'high', 0)).toBeCloseTo(1.6)
    expect(renderPixelRatio(2, 'low', 0)).toBeCloseTo(1)
    expect(renderPixelRatio(2, 'low', 1)).toBeCloseTo(2)
    expect(renderPixelRatio(1, 'ultra', 0)).toBeCloseTo(1)
    expect(renderPixelRatio(Number.NaN, 'medium', 0)).toBeCloseTo(0.67)
    expect(effectiveRenderScale('medium', 5)).toBe(1)
  })
})
