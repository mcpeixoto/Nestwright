import { describe, expect, it } from 'vitest'
import { safeStatName, startSteam } from '../../electron/steam'

const STAT_MAX = 2147483647

describe('stat names', () => {
  it('accepts the same ids as achievements', () => {
    expect(safeStatName('walls_built')).toBe('walls_built')
    expect(safeStatName('A-1')).toBe('A-1')
    expect(safeStatName('')).toBeNull()
    expect(safeStatName('has space')).toBeNull()
    expect(safeStatName('../x')).toBeNull()
    expect(safeStatName('x'.repeat(65))).toBeNull()
    expect(safeStatName(4)).toBeNull()
  })
})

describe('steam stats', () => {
  it('reads stats and clamps writes without storing on every set', () => {
    const sets: { name: string; value: number }[] = []
    const stores: number[] = []
    const scheduled: { fn: () => void; delay: number; cleared: boolean }[] = []
    const runtime = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      warn: () => {},
      setTimer: (fn, delay) => {
        const handle = { fn, delay, cleared: false }
        scheduled.push(handle)
        return handle
      },
      clearTimer: (handle) => {
        ;(handle as { cleared: boolean }).cleared = true
      },
      load: () => ({
        init: () => ({
          localplayer: { getName: () => 'Ada' },
          achievement: { activate: () => true },
          overlay: { activateToWebPage: () => {} },
          stats: {
            getInt: (name: string) => (name === 'walls_built' ? 3 : null),
            setInt: (name: string, value: number) => {
              sets.push({ name, value })
              return true
            },
            store: () => {
              stores.push(stores.length + 1)
              return true
            },
          },
        }),
      }),
    })

    expect(runtime.getStat('walls_built')).toBe(3)
    expect(runtime.getStat('missing_stat')).toBeNull()
    expect(runtime.getStat('bad name')).toBeNull()

    expect(runtime.setStat('walls_built', 1.2)).toBe(true)
    expect(runtime.setStat('walls_built', 1.6)).toBe(true)
    expect(runtime.setStat('walls_built', -4)).toBe(true)
    expect(runtime.setStat('walls_built', STAT_MAX + 20)).toBe(true)
    expect(runtime.setStat('walls_built', Number.NaN)).toBe(false)
    expect(runtime.setStat('walls_built', Number.POSITIVE_INFINITY)).toBe(false)
    expect(runtime.setStat('bad name', 1)).toBe(false)

    expect(sets).toEqual([
      { name: 'walls_built', value: 1 },
      { name: 'walls_built', value: 2 },
      { name: 'walls_built', value: 0 },
      { name: 'walls_built', value: STAT_MAX },
    ])
    expect(stores).toEqual([])
    expect(scheduled.filter((handle) => !handle.cleared)).toHaveLength(1)
    expect(scheduled[0]?.delay).toBe(5000)

    const due = scheduled[0]
    expect(due).toBeDefined()
    if (due) {
      due.cleared = true
      due.fn()
    }
    expect(stores).toEqual([1])

    expect(runtime.setStat('walls_built', 4)).toBe(true)
    expect(scheduled.filter((handle) => !handle.cleared)).toHaveLength(1)
    runtime.flush()
    expect(stores).toEqual([1, 2])
    expect(scheduled.filter((handle) => !handle.cleared)).toHaveLength(0)
  })

  it('returns null and false when the stats namespace is missing', () => {
    const runtime = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      warn: () => {},
      load: () => ({
        init: () => ({
          localplayer: { getName: () => 'Ada' },
          achievement: { activate: () => true },
          overlay: { activateToWebPage: () => {} },
        }),
      }),
    })
    expect(runtime.getStat('walls_built')).toBeNull()
    expect(runtime.setStat('walls_built', 1)).toBe(false)
    expect(runtime.storeStats()).toBe(false)
    expect(() => runtime.flush()).not.toThrow()
  })
})
