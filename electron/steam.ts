import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

declare const __filename: string

const SPACEWAR_APP_ID = 480

export interface SteamClient {
  localplayer: { getName: () => string }
  achievement: { activate: (id: string) => boolean }
  overlay: { activateToWebPage: (url: string) => void }
}

export interface SteamModule {
  init: (appId: number) => SteamClient
  restartAppIfNecessary?: (appId: number) => boolean
  electronEnableSteamOverlay?: (disableEachFrameInvalidation?: boolean) => void
}

export interface SteamRuntime {
  available: boolean
  restarting: boolean
  playerName: string
  unlock: (id: string) => boolean
  overlay: (url: string) => void
}

export interface SteamLaunch {
  load: boolean
  appId: number | null
}

interface StartOptions {
  env?: NodeJS.ProcessEnv
  readAppIdFile?: () => string | null
  load?: () => SteamModule
  warn?: (message: string) => void
}

let warned = false

export function resetSteamWarningForTests(): void {
  warned = false
}

function warnOnce(warn: (message: string) => void, message: string): void {
  if (warned) return
  warned = true
  warn(message)
}

function parseAppId(text: string | null | undefined): number | null {
  if (text == null) return null
  const trimmed = text.trim()
  if (!/^[0-9]+$/.test(trimmed)) return null
  const id = Number(trimmed)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

/** Spacewar (480) is the dev fallback only. A steam_appid.txt value always wins. */
export function resolveSteamLaunch(input: {
  envFlag: string | undefined
  envAppId: string | undefined
  fileText: string | null
}): SteamLaunch {
  const fileText = input.fileText
  if (fileText != null && fileText.trim().length > 0) {
    const fromFile = parseAppId(fileText)
    if (fromFile != null) return { load: true, appId: fromFile }
  }
  if (input.envFlag === '1') {
    return { load: true, appId: parseAppId(input.envAppId) ?? SPACEWAR_APP_ID }
  }
  return { load: false, appId: null }
}

export function safeAchievementId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  return id
}

export function safeOverlayUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 2000) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function steamAppIdLocations(): string[] {
  const locations = [path.join(path.dirname(process.execPath), 'steam_appid.txt'), path.join(process.cwd(), 'steam_appid.txt')]
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    locations.splice(1, 0, path.join(process.resourcesPath, 'steam_appid.txt'))
  }
  return locations
}

export function readSteamAppIdFile(locations = steamAppIdLocations()): string | null {
  for (const file of locations) {
    try {
      return fs.readFileSync(file, 'utf8')
    } catch {
      /* try the next place Steam or the packager may have put the file */
    }
  }
  return null
}

function moduleFilename(): string {
  try {
    if (typeof __filename === 'string' && __filename.length > 0) return __filename
  } catch {
    /* the vitest ESM runner has no __filename */
  }
  return path.join(process.cwd(), 'package.json')
}

function defaultLoad(): SteamModule {
  const require = createRequire(moduleFilename())
  return require('steamworks.js') as SteamModule
}

function offline(): SteamRuntime {
  return {
    available: false,
    restarting: false,
    playerName: '',
    unlock: () => false,
    overlay: () => {},
  }
}

export function startSteam(options: StartOptions = {}): SteamRuntime {
  const env = options.env ?? process.env
  const readAppIdFile = options.readAppIdFile ?? readSteamAppIdFile
  const warn = options.warn ?? ((message: string) => console.warn(message))
  let fileText: string | null
  try {
    fileText = readAppIdFile()
  } catch {
    fileText = null
  }
  const decision = resolveSteamLaunch({
    envFlag: env.NESTWRIGHT_STEAM,
    envAppId: env.NESTWRIGHT_STEAM_APPID,
    fileText,
  })
  if (!decision.load || decision.appId == null) {
    if (fileText != null && fileText.trim().length > 0) {
      warnOnce(warn, 'Steam app id file is not a number; running without Steam')
    }
    return offline()
  }
  const appId = decision.appId
  try {
    const mod = (options.load ?? defaultLoad)()
    if (mod.restartAppIfNecessary?.(appId)) {
      return { ...offline(), restarting: true }
    }
    try {
      mod.electronEnableSteamOverlay?.()
    } catch {
      /* overlay setup must not block the editor */
    }
    const client = mod.init(appId)
    let playerName = ''
    try {
      playerName = client.localplayer.getName() || ''
    } catch {
      playerName = ''
    }
    return {
      available: true,
      restarting: false,
      playerName,
      unlock: (id: string) => {
        const clean = safeAchievementId(id)
        if (!clean) return false
        try {
          return client.achievement.activate(clean) === true
        } catch {
          return false
        }
      },
      overlay: (url: string) => {
        const clean = safeOverlayUrl(url)
        if (!clean) return
        client.overlay.activateToWebPage(clean)
      },
    }
  } catch {
    warnOnce(warn, 'Steam is not available; running without it')
    return offline()
  }
}
