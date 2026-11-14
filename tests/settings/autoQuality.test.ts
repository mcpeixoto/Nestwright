import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, initialSettings, mergeSettings } from '../../src/settings'

describe('first-run graphics benchmark setting', () => {
  it('is on for a fresh install only', () => {
    expect(initialSettings(null).qualityAuto).toBe(true)
    expect(initialSettings('').qualityAuto).toBe(true)
    expect(initialSettings(null).graphicsQuality).toBe(DEFAULT_SETTINGS.graphicsQuality)
  })

  it('keeps an existing user on the tier they chose', () => {
    const saved = JSON.stringify({ graphicsQuality: 'low', language: 'en' })
    const settings = initialSettings(saved)
    expect(settings.qualityAuto).toBe(false)
    expect(settings.graphicsQuality).toBe('low')
  })

  it('keeps a stored choice either way', () => {
    expect(initialSettings(JSON.stringify({ qualityAuto: true })).qualityAuto).toBe(true)
    expect(initialSettings(JSON.stringify({ qualityAuto: false })).qualityAuto).toBe(false)
  })

  it('turns off when a tier is picked by hand, so the benchmark never runs again', () => {
    const fresh = initialSettings(null)
    const picked = mergeSettings(fresh, { graphicsQuality: 'medium' })
    expect(picked.qualityAuto).toBe(false)
    expect(picked.graphicsQuality).toBe('medium')
  })

  it('stores the benchmark result and stops, and can be switched back on', () => {
    const fresh = initialSettings(null)
    const done = mergeSettings(fresh, { graphicsQuality: 'ultra', qualityAuto: false })
    expect(done).toMatchObject({ graphicsQuality: 'ultra', qualityAuto: false })
    const again = mergeSettings(done, { qualityAuto: true })
    expect(again).toMatchObject({ graphicsQuality: 'ultra', qualityAuto: true })
  })

  it('leaves it alone for unrelated changes', () => {
    const fresh = initialSettings(null)
    expect(mergeSettings(fresh, { showFps: true }).qualityAuto).toBe(true)
  })
})
