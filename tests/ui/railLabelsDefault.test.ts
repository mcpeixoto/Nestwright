import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings'

describe('rail labels default', () => {
  it('shows labels unless turned off', () => {
    expect(normalizeSettings({}).railLabels).toBe(true)
    expect(normalizeSettings({ railLabels: false }).railLabels).toBe(false)
    expect(DEFAULT_SETTINGS.railLabels).toBe(true)
  })
})
