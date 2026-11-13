import { describe, expect, it } from 'vitest'
import { normalizeSettings, type Settings } from '../../src/settings'

describe('normalizeSettings', () => {
  it('clamps the new fields and accepts a short Portuguese tag', () => {
    const settings = normalizeSettings({
      uiScale: 2,
      mouseSensitivity: 0,
      autosaveInterval: 7,
      language: 'pt',
    } as unknown as Partial<Settings>)
    expect(settings.uiScale).toBe(1.25)
    expect(settings.mouseSensitivity).toBe(0.4)
    expect(settings.autosaveInterval).toBe(15)
    expect(settings.language).toBe('pt-PT')
  })
})
