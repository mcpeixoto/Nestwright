import { describe, expect, it } from 'vitest'
import { relativeTime } from '../../src/ui/start/recentList'

describe('relativeTime', () => {
  const now = Date.UTC(2026, 10, 13, 12, 0, 0)

  it('says how long ago a recent project was opened', () => {
    expect(relativeTime(now - 30_000, now)).toEqual({ key: 'Just now' })
    expect(relativeTime(now - 2 * 60 * 60 * 1000, now)).toEqual({ key: '{n} h ago', n: 2 })
    expect(relativeTime(now - 5 * 60 * 1000, now)).toEqual({ key: '{n} min ago', n: 5 })
  })
})
