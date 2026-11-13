import type { SteamApi } from './types'

interface SteamBridge {
  available: () => Promise<boolean>
  playerName: () => Promise<string>
  unlock: (id: string) => Promise<boolean>
  overlayUrl: (url: string) => Promise<void>
}

/** Electron preload surface. Absent in the browser, so the platform field stays undefined. */
export function steamFromBridge(steam: SteamBridge | undefined): SteamApi | undefined {
  if (!steam) return undefined
  return {
    available: () => Promise.resolve(steam.available()).then(Boolean).catch(() => false),
    playerName: () => Promise.resolve(steam.playerName()).then((name) => String(name ?? '')).catch(() => ''),
    unlock: (id) => Promise.resolve(steam.unlock(id)).then(Boolean).catch(() => false),
    overlayUrl: (url) => Promise.resolve(steam.overlayUrl(url)).then(() => undefined).catch(() => undefined),
  }
}
