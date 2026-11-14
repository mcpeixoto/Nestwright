import { describe, expect, it } from 'vitest'
import { safePresence, startSteam } from '../../electron/steam'

describe('safePresence', () => {
  it('trims, collapses whitespace, strips controls, and caps length', () => {
    expect(safePresence('  Building   a\thouse  ')).toBe('Building a house')
    expect(safePresence('line\nbreak')).toBe('line break')
    expect(safePresence('a\u0000b\u0007c')).toBe('abc')
    expect(safePresence(`   ${'n'.repeat(119)}YZ`)).toBe('n'.repeat(119) + 'Y')
    expect(safePresence('   ')).toBeNull()
    expect(safePresence('')).toBeNull()
    expect(safePresence('\u0000\u0007')).toBeNull()
    expect(safePresence(12)).toBeNull()
    expect(safePresence(null)).toBeNull()
  })
})

describe('rich presence', () => {
  it('sets status and the display token, and clears both keys for null', () => {
    const calls: { key: string; value: string | undefined }[] = []
    const runtime = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      warn: () => {},
      load: () => ({
        init: () => ({
          localplayer: {
            getName: () => 'Ada',
            setRichPresence: (key: string, value?: string) => {
              calls.push({ key, value })
            },
          },
          achievement: { activate: () => true },
          overlay: { activateToWebPage: () => {} },
        }),
      }),
    })

    expect(runtime.setPresence('  Placing   walls  ')).toBe(true)
    expect(calls).toEqual([
      { key: 'status', value: 'Placing walls' },
      { key: 'steam_display', value: '#Status' },
    ])

    calls.length = 0
    expect(runtime.setPresence(null)).toBe(true)
    expect(calls).toEqual([
      { key: 'status', value: undefined },
      { key: 'steam_display', value: undefined },
    ])

    calls.length = 0
    expect(runtime.setPresence('   ')).toBe(true)
    expect(calls).toEqual([
      { key: 'status', value: undefined },
      { key: 'steam_display', value: undefined },
    ])
  })

  it('returns false when rich presence is missing or throws', () => {
    const offline = startSteam({
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
    expect(offline.setPresence('Building')).toBe(false)

    const throwing = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      warn: () => {},
      load: () => ({
        init: () => ({
          localplayer: {
            getName: () => 'Ada',
            setRichPresence: () => {
              throw new Error('overlay busy')
            },
          },
          achievement: { activate: () => true },
          overlay: { activateToWebPage: () => {} },
        }),
      }),
    })
    expect(throwing.setPresence('Building')).toBe(false)
    expect(throwing.setPresence(null)).toBe(false)
  })
})
