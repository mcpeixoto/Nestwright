import { describe, expect, it } from 'vitest'
import { safeKeyboardRequest, startSteam, toKeyboardRect } from '../../electron/steam'

describe('safeKeyboardRequest', () => {
  it('maps modes and rounds a finite rect', () => {
    expect(safeKeyboardRequest({ mode: 'single', x: 1.2, y: 2.6, width: 10.2, height: 20.8 })).toEqual({
      mode: 0,
      x: 1,
      y: 3,
      width: 10,
      height: 21,
    })
    expect(safeKeyboardRequest({ mode: 'multi', x: 0, y: 0, width: 1, height: 1 })?.mode).toBe(1)
    expect(safeKeyboardRequest({ mode: 'email', x: 0, y: 0, width: 8, height: 8 })?.mode).toBe(2)
    expect(safeKeyboardRequest({ mode: 'numeric', x: 0, y: 0, width: 8, height: 8 })?.mode).toBe(3)
    expect(safeKeyboardRequest({ mode: 'single', x: 0, y: 0, width: 16384, height: 1 })).toEqual({
      mode: 0,
      x: 0,
      y: 0,
      width: 16384,
      height: 1,
    })
  })

  it('rejects modes and rects Steam would not accept', () => {
    expect(safeKeyboardRequest({ mode: 'password', x: 0, y: 0, width: 10, height: 10 })).toBeNull()
    expect(safeKeyboardRequest({ mode: 'single', x: -0.6, y: 0, width: 10, height: 10 })).toBeNull()
    expect(safeKeyboardRequest({ mode: 'single', x: 0, y: 0, width: 0.4, height: 10 })).toBeNull()
    expect(safeKeyboardRequest({ mode: 'single', x: 0, y: 0, width: 16384.6, height: 10 })).toBeNull()
    expect(safeKeyboardRequest({ mode: 'single', x: Number.NaN, y: 0, width: 10, height: 10 })).toBeNull()
    expect(safeKeyboardRequest({ mode: 'single', x: Number.POSITIVE_INFINITY, y: 0, width: 10, height: 10 })).toBeNull()
    expect(safeKeyboardRequest({ mode: 'single', x: '0', y: 0, width: 10, height: 10 })).toBeNull()
    expect(safeKeyboardRequest(null)).toBeNull()
  })
})

describe('toKeyboardRect', () => {
  it('scales content pixels by the page zoom and rounds to integers', () => {
    expect(toKeyboardRect({ x: 10, y: 20, width: 30, height: 40 }, 2)).toEqual({
      x: 20,
      y: 40,
      width: 60,
      height: 80,
    })
    expect(toKeyboardRect({ x: 1.2, y: 2.6, width: 3.2, height: 4.8 }, 1)).toEqual({
      x: 1,
      y: 3,
      width: 3,
      height: 5,
    })
  })
})

describe('floating keyboard', () => {
  it('reports Steam Deck as false when the check throws', () => {
    const runtime = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      warn: () => {},
      load: () => ({
        init: () => ({
          localplayer: { getName: () => 'Ada' },
          achievement: { activate: () => true },
          overlay: { activateToWebPage: () => {} },
          utils: {
            isSteamRunningOnSteamDeck: () => {
              throw new Error('no deck')
            },
            showFloatingGamepadTextInput: async () => true,
          },
        }),
      }),
    })
    expect(runtime.isSteamDeck).toBe(false)
  })

  it('forwards a valid keyboard request and returns the Steam result', async () => {
    const seen: unknown[][] = []
    let result = true
    const runtime = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      warn: () => {},
      load: () => ({
        init: () => ({
          localplayer: { getName: () => 'Ada' },
          achievement: { activate: () => true },
          overlay: { activateToWebPage: () => {} },
          utils: {
            isSteamRunningOnSteamDeck: () => true,
            showFloatingGamepadTextInput: async (mode: number, x: number, y: number, width: number, height: number) => {
              seen.push([mode, x, y, width, height])
              return result
            },
          },
        }),
      }),
    })
    expect(runtime.isSteamDeck).toBe(true)
    await expect(runtime.showKeyboard({ mode: 'email', x: 1.2, y: 4, width: 80, height: 24 })).resolves.toBe(true)
    expect(seen).toEqual([[2, 1, 4, 80, 24]])
    result = false
    await expect(runtime.showKeyboard({ mode: 'single', x: 0, y: 0, width: 10, height: 10 })).resolves.toBe(false)
    const rejected = { mode: 'nope', x: 0, y: 0, width: 10, height: 10 }
    await expect(
      runtime.showKeyboard(rejected as { mode: 'single'; x: number; y: number; width: number; height: number }),
    ).resolves.toBe(false)
    expect(seen).toHaveLength(2)
  })

  it('returns false when the keyboard call throws or the namespace is missing', async () => {
    const throwing = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      warn: () => {},
      load: () => ({
        init: () => ({
          localplayer: { getName: () => 'Ada' },
          achievement: { activate: () => true },
          overlay: { activateToWebPage: () => {} },
          utils: {
            isSteamRunningOnSteamDeck: () => false,
            showFloatingGamepadTextInput: async () => {
              throw new Error('keyboard failed')
            },
          },
        }),
      }),
    })
    await expect(throwing.showKeyboard({ mode: 'single', x: 0, y: 0, width: 10, height: 10 })).resolves.toBe(false)

    const missing = startSteam({
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
    expect(missing.isSteamDeck).toBe(false)
    await expect(missing.showKeyboard({ mode: 'multi', x: 0, y: 0, width: 10, height: 10 })).resolves.toBe(false)
  })
})
