import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings'

describe('exposure compensation setting', () => {
  it('defaults to 0 EV and is clamped to ±2 in tenths', () => {
    expect(DEFAULT_SETTINGS.exposureComp).toBe(0)
    expect(normalizeSettings({}).exposureComp).toBe(0)
    expect(normalizeSettings({ exposureComp: 0.73 }).exposureComp).toBeCloseTo(0.7, 9)
    expect(normalizeSettings({ exposureComp: -7 }).exposureComp).toBe(-2)
    expect(normalizeSettings({ exposureComp: Number.NaN }).exposureComp).toBe(0)
    expect(normalizeSettings({ exposureComp: '1' as unknown as number }).exposureComp).toBe(0)
  })
})
