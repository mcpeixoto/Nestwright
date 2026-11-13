import { describe, expect, it } from 'vitest'
import {
  resetSteamWarningForTests,
  resolveSteamLaunch,
  safeAchievementId,
  safeOverlayUrl,
  startSteam,
} from '../../electron/steam'

describe('steam launch decision', () => {
  it('stays offline unless the env flag or an app id file asks for Steam', () => {
    expect(resolveSteamLaunch({ envFlag: undefined, envAppId: undefined, fileText: null })).toEqual({
      load: false,
      appId: null,
    })
    expect(resolveSteamLaunch({ envFlag: '0', envAppId: '480', fileText: null })).toEqual({
      load: false,
      appId: null,
    })
  })

  it('uses Spacewar 480 only when the dev env flag is set and no app id was given', () => {
    expect(resolveSteamLaunch({ envFlag: '1', envAppId: undefined, fileText: null })).toEqual({
      load: true,
      appId: 480,
    })
    expect(resolveSteamLaunch({ envFlag: '1', envAppId: 'nope', fileText: null })).toEqual({
      load: true,
      appId: 480,
    })
    expect(resolveSteamLaunch({ envFlag: '1', envAppId: '12345', fileText: null })).toEqual({
      load: true,
      appId: 12345,
    })
  })

  it('prefers a numeric steam_appid.txt over the dev placeholder', () => {
    expect(resolveSteamLaunch({ envFlag: '1', envAppId: '480', fileText: '4242\n' })).toEqual({
      load: true,
      appId: 4242,
    })
    expect(resolveSteamLaunch({ envFlag: undefined, envAppId: undefined, fileText: '4242' })).toEqual({
      load: true,
      appId: 4242,
    })
    expect(resolveSteamLaunch({ envFlag: undefined, envAppId: undefined, fileText: 'soon' })).toEqual({
      load: false,
      appId: null,
    })
  })

  it('rejects achievement ids and overlay urls that are not safe to forward', () => {
    expect(safeAchievementId('first-wall')).toBe('first-wall')
    expect(safeAchievementId('ACH_OK')).toBe('ACH_OK')
    expect(safeAchievementId('../passwd')).toBeNull()
    expect(safeAchievementId('has space')).toBeNull()
    expect(safeAchievementId(12)).toBeNull()
    expect(safeOverlayUrl('https://store.steampowered.com/app/480')).toBe('https://store.steampowered.com/app/480')
    expect(safeOverlayUrl('http://127.0.0.1/news')).toBe('http://127.0.0.1/news')
    expect(safeOverlayUrl('file:///etc/passwd')).toBeNull()
    expect(safeOverlayUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('steam runtime', () => {
  it('does not load the native module when Steam was not requested', () => {
    let loaded = false
    const runtime = startSteam({
      env: {},
      readAppIdFile: () => null,
      load: () => {
        loaded = true
        throw new Error('should not load')
      },
      warn: () => {},
    })
    expect(loaded).toBe(false)
    expect(runtime.available).toBe(false)
    expect(runtime.playerName).toBe('')
    expect(runtime.unlock('first-wall')).toBe(false)
  })

  it('exposes the player name and unlocks through a loaded client', () => {
    let inited = 0
    let opened = ''
    const runtime = startSteam({
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      load: () => ({
        init: (appId: number) => {
          inited = appId
          return {
            localplayer: { getName: () => 'Ada' },
            achievement: { activate: (id: string) => id === 'first-wall' },
            overlay: { activateToWebPage: (url: string) => { opened = url } },
          }
        },
      }),
      warn: () => {},
    })
    expect(inited).toBe(480)
    expect(runtime.available).toBe(true)
    expect(runtime.playerName).toBe('Ada')
    expect(runtime.unlock('first-wall')).toBe(true)
    expect(runtime.unlock('missing')).toBe(false)
    runtime.overlay('https://example.com/nest')
    expect(opened).toBe('https://example.com/nest')
  })

  it('logs a module failure once and keeps running', () => {
    resetSteamWarningForTests()
    const warnings: string[] = []
    const options = {
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      load: () => {
        throw new Error('Steam client is not running')
      },
      warn: (message: string) => warnings.push(message),
    }
    const first = startSteam(options)
    const second = startSteam(options)
    expect(first.available).toBe(false)
    expect(second.available).toBe(false)
    expect(warnings).toEqual(['Steam is not available; running without it'])
  })
})
