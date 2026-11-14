import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

declare const __filename: string

const SPACEWAR_APP_ID = 480
const STAT_MAX = 2 ** 31 - 1
const STAT_STORE_MS = 5000
const PRESENCE_MAX = 120
const KEYBOARD_MAX = 16384

const KEYBOARD_MODES = {
  single: 0,
  multi: 1,
  email: 2,
  numeric: 3,
} as const

export interface KeyboardRequest {
  mode: 'single' | 'multi' | 'email' | 'numeric'
  x: number
  y: number
  width: number
  height: number
}

export interface SteamClient {
  localplayer: {
    getName: () => string
    setRichPresence?: (key: string, value?: string) => void
  }
  achievement: { activate: (id: string) => boolean }
  overlay: { activateToWebPage: (url: string) => void }
  stats?: {
    getInt?: (name: string) => number | null
    setInt?: (name: string, value: number) => boolean
    store?: () => boolean
  }
  utils?: {
    isSteamRunningOnSteamDeck?: () => boolean
    showFloatingGamepadTextInput?: (
      mode: number,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => Promise<boolean>
  }
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
  /** False when the utils namespace is missing or the Deck check throws. */
  isSteamDeck: boolean
  unlock: (id: string) => boolean
  overlay: (url: string) => void
  getStat: (name: string) => number | null
  setStat: (name: string, value: number) => boolean
  storeStats: () => boolean
  /** Writes any batched stat changes immediately. */
  flush: () => void
  setPresence: (status: string | null) => boolean
  showKeyboard: (req: KeyboardRequest) => Promise<boolean>
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
  /** True for a packaged build. Spacewar (480) logs a warning in that case. */
  packaged?: boolean
  /** Test hook. Defaults to setTimeout. Stat stores are batched through this. */
  setTimer?: (callback: () => void, delayMs: number) => unknown
  clearTimer?: (handle: unknown) => void
}

let warned = false
let warnedDevApp = false

export function resetSteamWarningForTests(): void {
  warned = false
  warnedDevApp = false
}

function warnOnce(warn: (message: string) => void, message: string): void {
  if (warned) return
  warned = true
  warn(message)
}

function warnDevAppOnce(warn: (message: string) => void, message: string): void {
  if (warnedDevApp) return
  warnedDevApp = true
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
  /** `SteamAppId`, set by the Steam client when it launches the game. */
  steamClientAppId?: string | undefined
}): SteamLaunch {
  const fileText = input.fileText
  if (fileText != null && fileText.trim().length > 0) {
    const fromFile = parseAppId(fileText)
    if (fromFile != null) return { load: true, appId: fromFile }
  }
  const fromClient = parseAppId(input.steamClientAppId)
  if (fromClient != null) return { load: true, appId: fromClient }
  if (input.envFlag === '1') {
    return { load: true, appId: parseAppId(input.envAppId) ?? SPACEWAR_APP_ID }
  }
  return { load: false, appId: null }
}

/** True for Spacewar, the Steamworks sample app used as the dev fallback. */
export function isDevAppId(id: number): boolean {
  return id === SPACEWAR_APP_ID
}

function safeKey(id: unknown): string | null {
  if (typeof id !== 'string') return null
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  return id
}

export function safeAchievementId(id: unknown): string | null {
  return safeKey(id)
}

export function safeStatName(name: unknown): string | null {
  return safeKey(name)
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

/** Rich-presence text: trimmed, whitespace collapsed, controls removed, max 120. Empty becomes null. */
export function safePresence(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const collapsed = stripControls(value).replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return null
  return collapsed.slice(0, PRESENCE_MAX)
}

/** Drop C0/C1 controls. Tab and newlines stay so they collapse into spaces. */
function stripControls(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    const whitespace = code === 9 || code === 10 || code === 13
    const control = (code >= 0 && code <= 31) || (code >= 127 && code <= 159)
    if (control && !whitespace) continue
    out += char
  }
  return out
}

function finiteInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(value)
}

export function safeKeyboardRequest(
  req: unknown,
): { mode: number; x: number; y: number; width: number; height: number } | null {
  if (req == null || typeof req !== 'object') return null
  const body = req as { mode?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown }
  if (
    body.mode !== 'single' &&
    body.mode !== 'multi' &&
    body.mode !== 'email' &&
    body.mode !== 'numeric'
  ) {
    return null
  }
  const x = finiteInt(body.x)
  const y = finiteInt(body.y)
  const width = finiteInt(body.width)
  const height = finiteInt(body.height)
  if (x == null || y == null || width == null || height == null) return null
  if (x < 0 || y < 0) return null
  if (width < 1 || width > KEYBOARD_MAX || height < 1 || height > KEYBOARD_MAX) return null
  return { mode: KEYBOARD_MODES[body.mode], x, y, width, height }
}

/**
 * Page CSS pixels to window pixels by the page zoom.
 * Display scaleFactor is intentionally not applied; see the IPC handler.
 */
export function toKeyboardRect(
  rect: { x: number; y: number; width: number; height: number },
  zoom: number,
): { x: number; y: number; width: number; height: number } {
  const factor = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    x: Math.round(rect.x * factor),
    y: Math.round(rect.y * factor),
    width: Math.round(rect.width * factor),
    height: Math.round(rect.height * factor),
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
    isSteamDeck: false,
    unlock: () => false,
    overlay: () => {},
    getStat: () => null,
    setStat: () => false,
    storeStats: () => false,
    flush: () => {},
    setPresence: () => false,
    showKeyboard: () => Promise.resolve(false),
  }
}

export function startSteam(options: StartOptions = {}): SteamRuntime {
  const env = options.env ?? process.env
  const readAppIdFile = options.readAppIdFile ?? readSteamAppIdFile
  const warn = options.warn ?? ((message: string) => console.warn(message))
  const setTimer = options.setTimer ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs))
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
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
    steamClientAppId: env.SteamAppId,
  })
  if (!decision.load || decision.appId == null) {
    if (fileText != null && fileText.trim().length > 0) {
      warnOnce(warn, 'Steam app id file is not a number; running without Steam')
    }
    return offline()
  }
  const appId = decision.appId
  if (options.packaged === true && isDevAppId(appId)) {
    warnDevAppOnce(warn, 'Packaged build is running on the Spacewar dev app id (480)')
  }
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
    let isSteamDeck = false
    try {
      isSteamDeck = client.utils?.isSteamRunningOnSteamDeck?.() === true
    } catch {
      isSteamDeck = false
    }
    let storeTimer: unknown = null
    const persistStats = (): boolean => {
      try {
        return client.stats?.store?.() === true
      } catch {
        return false
      }
    }
    const cancelStore = () => {
      if (storeTimer == null) return
      const handle = storeTimer
      storeTimer = null
      try {
        clearTimer(handle)
      } catch {
        /* timer cleanup must not block shutdown */
      }
    }
    const scheduleStore = () => {
      if (storeTimer != null) return
      try {
        storeTimer = setTimer(() => {
          storeTimer = null
          persistStats()
        }, STAT_STORE_MS)
      } catch {
        storeTimer = null
      }
    }
    const storeStats = (): boolean => {
      cancelStore()
      return persistStats()
    }
    return {
      available: true,
      restarting: false,
      playerName,
      isSteamDeck,
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
      getStat: (name: string) => {
        const clean = safeStatName(name)
        if (!clean) return null
        try {
          const value = client.stats?.getInt?.(clean)
          return typeof value === 'number' && Number.isFinite(value) ? value : null
        } catch {
          return null
        }
      },
      // Progress achievements are ordinary stats bound to an achievement in
      // Steamworks. Steam draws the progress bar from that stat; there is no
      // separate progress API on this bridge.
      setStat: (name: string, value: number) => {
        const clean = safeStatName(name)
        if (!clean) return false
        if (typeof value !== 'number' || !Number.isFinite(value)) return false
        const clamped = Math.min(STAT_MAX, Math.max(0, Math.round(value)))
        try {
          if (client.stats?.setInt?.(clean, clamped) !== true) return false
        } catch {
          return false
        }
        scheduleStore()
        return true
      },
      storeStats,
      flush: () => {
        storeStats()
      },
      setPresence: (status: string | null) => {
        const clean = status == null ? null : safePresence(status)
        const set = client.localplayer.setRichPresence
        if (typeof set !== 'function') return false
        try {
          if (clean == null) {
            set('status', undefined)
            set('steam_display', undefined)
          } else {
            set('status', clean)
            set('steam_display', '#Status')
          }
          return true
        } catch {
          return false
        }
      },
      showKeyboard: async (req: KeyboardRequest) => {
        const clean = safeKeyboardRequest(req)
        if (!clean) return false
        const show = client.utils?.showFloatingGamepadTextInput
        if (typeof show !== 'function') return false
        try {
          return (await show(clean.mode, clean.x, clean.y, clean.width, clean.height)) === true
        } catch {
          return false
        }
      },
    }
  } catch {
    warnOnce(warn, 'Steam is not available; running without it')
    return offline()
  }
}
