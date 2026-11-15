import { describe, expect, it } from 'vitest'
import { mergeSettings, normalizeSettings, type Settings } from '../../src/settings'
import { raiseBriefStars } from '../../src/settings/briefStars'

describe('briefStars', () => {
  it('defaults a missing or unusable record to empty', () => {
    expect(normalizeSettings({}).briefStars).toEqual({})
    expect(normalizeSettings(null).briefStars).toEqual({})
    expect(normalizeSettings({ briefStars: null } as unknown as Partial<Settings>).briefStars).toEqual({})
    expect(normalizeSettings({ briefStars: [1, 2] } as unknown as Partial<Settings>).briefStars).toEqual({})
  })

  it('keeps star counts and drops values that are not counts', () => {
    const settings = normalizeSettings({
      briefStars: {
        'starter-flat-for-two': 2,
        high: 9,
        fraction: 2.9,
        zero: 0,
        bad: '2',
        nan: Number.NaN,
      },
    } as unknown as Partial<Settings>)
    expect(settings.briefStars).toEqual({
      'starter-flat-for-two': 2,
      high: 3,
      fraction: 2,
    })
  })

  it('only raises a stored star count', () => {
    const stored = { 'starter-flat-for-two': 2 }
    expect(raiseBriefStars(stored, 'starter-flat-for-two', 1)).toBe(stored)
    expect(raiseBriefStars(stored, 'starter-flat-for-two', 2)).toBe(stored)
    expect(raiseBriefStars(stored, 'starter-flat-for-two', 0)).toBe(stored)
    const raised = raiseBriefStars(stored, 'starter-flat-for-two', 3)
    expect(raised).toEqual({ 'starter-flat-for-two': 3 })
    expect(stored).toEqual({ 'starter-flat-for-two': 2 })
    expect(raiseBriefStars(stored, 'family-on-a-slope', 1)).toEqual({
      'starter-flat-for-two': 2,
      'family-on-a-slope': 1,
    })
  })

  it('never lowers stars when settings are saved', () => {
    const current = normalizeSettings({ briefStars: { a: 2, b: 1 } })
    const merged = mergeSettings(current, { briefStars: { a: 1, c: 3 } })
    expect(merged.briefStars).toEqual({ a: 2, b: 1, c: 3 })
  })
})
