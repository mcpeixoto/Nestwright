import { describe, expect, it } from 'vitest'
import { en } from '../../src/i18n/en'
import { pt } from '../../src/i18n/pt'
import { normalizeSettings } from '../../src/settings'

const NEW_KEYS = ['Show tool labels'] as const

describe('rail copy', () => {
  it('has a European Portuguese translation for every new key', () => {
    for (const key of NEW_KEYS) {
      expect(en[key].length).toBeGreaterThan(0)
      expect(pt[key].length).toBeGreaterThan(0)
      expect(pt[key]).not.toBe(en[key])
    }
  })

  it('keeps tool labels off when an older settings file has no railLabels field', () => {
    expect(normalizeSettings({}).railLabels).toBe(false)
    expect(normalizeSettings({ railLabels: true }).railLabels).toBe(true)
  })
})
