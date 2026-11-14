import type { SteamApi, SteamKeyboardRequest } from './types'

interface SteamBridge {
  available: () => Promise<boolean>
  playerName: () => Promise<string>
  unlock: (id: string) => Promise<boolean>
  overlayUrl: (url: string) => Promise<void>
  getStat?: (name: string) => Promise<number | null>
  setStat?: (name: string, value: number) => Promise<boolean>
  setPresence?: (status: string | null) => Promise<boolean>
  showKeyboard?: (req: SteamKeyboardRequest) => Promise<boolean>
  isSteamDeck?: () => Promise<boolean>
}

/** Electron preload surface. Absent in the browser, so the platform field stays undefined. */
export function steamFromBridge(steam: SteamBridge | undefined): SteamApi | undefined {
  if (!steam) return undefined
  return {
    available: () => Promise.resolve(steam.available()).then(Boolean).catch(() => false),
    playerName: () => Promise.resolve(steam.playerName()).then((name) => String(name ?? '')).catch(() => ''),
    unlock: (id) => Promise.resolve(steam.unlock(id)).then(Boolean).catch(() => false),
    overlayUrl: (url) => Promise.resolve(steam.overlayUrl(url)).then(() => undefined).catch(() => undefined),
    getStat: (name) =>
      Promise.resolve(steam.getStat?.(name))
        .then((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null))
        .catch(() => null),
    setStat: (name, value) => Promise.resolve(steam.setStat?.(name, value)).then(Boolean).catch(() => false),
    setPresence: (status) => Promise.resolve(steam.setPresence?.(status)).then(Boolean).catch(() => false),
    showKeyboard: (req) => Promise.resolve(steam.showKeyboard?.(req)).then(Boolean).catch(() => false),
    isSteamDeck: () => Promise.resolve(steam.isSteamDeck?.()).then(Boolean).catch(() => false),
  }
}
