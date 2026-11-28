import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings'

describe('fullscreen setting', () => {
  it('defaults to off and keeps an explicit true', () => {
    expect(DEFAULT_SETTINGS.fullscreen).toBe(false)
    expect(normalizeSettings({}).fullscreen).toBe(false)
    expect(normalizeSettings({ fullscreen: true }).fullscreen).toBe(true)
  })
})
