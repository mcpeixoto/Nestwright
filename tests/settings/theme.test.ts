import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings'

describe('theme setting', () => {
  it('defaults to cozy and keeps only night as the alternate', () => {
    expect(normalizeSettings({}).theme).toBe('cozy')
    expect(normalizeSettings({ theme: 'night' }).theme).toBe('night')
    expect(normalizeSettings({ theme: 'blue' } as never).theme).toBe('cozy')
    expect(DEFAULT_SETTINGS.theme).toBe('cozy')
  })
})
