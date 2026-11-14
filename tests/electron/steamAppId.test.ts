import { describe, expect, it } from 'vitest'
import { isDevAppId, resetSteamWarningForTests, resolveSteamLaunch, startSteam } from '../../electron/steam'

function client() {
  return {
    localplayer: { getName: () => 'Ada' },
    achievement: { activate: () => true },
    overlay: { activateToWebPage: () => {} },
  }
}

describe('SteamAppId ordering', () => {
  it('prefers steam_appid.txt, then the Steam client env, then the dev flag', () => {
    expect(
      resolveSteamLaunch({ envFlag: '1', envAppId: '222', fileText: '333', steamClientAppId: '4242' }),
    ).toEqual({ load: true, appId: 333 })
    expect(
      resolveSteamLaunch({ envFlag: '1', envAppId: '222', fileText: null, steamClientAppId: '4242' }),
    ).toEqual({ load: true, appId: 4242 })
    expect(
      resolveSteamLaunch({ envFlag: '1', envAppId: '222', fileText: null, steamClientAppId: 'nope' }),
    ).toEqual({ load: true, appId: 222 })
    expect(
      resolveSteamLaunch({ envFlag: undefined, envAppId: undefined, fileText: null, steamClientAppId: ' 321 ' }),
    ).toEqual({ load: true, appId: 321 })
    expect(
      resolveSteamLaunch({ envFlag: undefined, envAppId: undefined, fileText: null, steamClientAppId: undefined }),
    ).toEqual({ load: false, appId: null })
  })

  it('passes SteamAppId into init when no app id file is present', () => {
    let inited = 0
    const runtime = startSteam({
      env: { SteamAppId: '4242' },
      readAppIdFile: () => null,
      warn: () => {},
      load: () => ({
        init: (appId: number) => {
          inited = appId
          return client()
        },
      }),
    })
    expect(inited).toBe(4242)
    expect(runtime.available).toBe(true)
  })
})

describe('dev app id warning', () => {
  it('treats 480 as the Spacewar dev id', () => {
    expect(isDevAppId(480)).toBe(true)
    expect(isDevAppId(481)).toBe(false)
  })

  it('warns once when a packaged build runs as 480', () => {
    resetSteamWarningForTests()
    const warnings: string[] = []
    const options = {
      env: { NESTWRIGHT_STEAM: '1' },
      readAppIdFile: () => null,
      packaged: true,
      warn: (message: string) => warnings.push(message),
      load: () => ({
        init: () => client(),
      }),
    }
    startSteam(options)
    startSteam(options)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('480')

    warnings.length = 0
    startSteam({ ...options, packaged: false })
    startSteam({
      ...options,
      env: { SteamAppId: '12345' },
      packaged: true,
    })
    expect(warnings).toEqual([])
  })
})
