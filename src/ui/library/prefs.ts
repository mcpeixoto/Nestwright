import { useSyncExternalStore } from 'react'

export const LIBRARY_PREFS_KEY = 'nestwright:library'
const RECENT_CAP = 12

export interface LibraryPrefs {
  favourites: string[]
  recent: string[]
  cardSize: 'small' | 'large'
}

const DEFAULTS: LibraryPrefs = { favourites: [], recent: [], cardSize: 'small' }

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

export function loadLibraryPrefs(storage: Storage | undefined = defaultStorage()): LibraryPrefs {
  try {
    const raw = storage?.getItem(LIBRARY_PREFS_KEY)
    if (!raw) return { ...DEFAULTS, favourites: [], recent: [] }
    const parsed = JSON.parse(raw) as Partial<LibraryPrefs> | null
    return {
      favourites: strings(parsed?.favourites),
      recent: strings(parsed?.recent).slice(0, RECENT_CAP),
      cardSize: parsed?.cardSize === 'large' ? 'large' : 'small',
    }
  } catch {
    return { ...DEFAULTS, favourites: [], recent: [] }
  }
}

const listeners = new Set<() => void>()
let snapshot: LibraryPrefs | null = null

function publish(prefs: LibraryPrefs): void {
  snapshot = prefs
  for (const listener of [...listeners]) listener()
}

export function saveLibraryPrefs(prefs: LibraryPrefs, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(LIBRARY_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage full or blocked: the in-memory copy still updates.
  }
  publish(prefs)
}

export function toggleFavourite(id: string, storage: Storage | undefined = defaultStorage()): LibraryPrefs {
  const prefs = loadLibraryPrefs(storage)
  const favourites = prefs.favourites.includes(id) ? prefs.favourites.filter((f) => f !== id) : [...prefs.favourites, id]
  const next = { ...prefs, favourites }
  saveLibraryPrefs(next, storage)
  return next
}

export function noteRecent(id: string, storage: Storage | undefined = defaultStorage()): LibraryPrefs {
  const prefs = loadLibraryPrefs(storage)
  const next = { ...prefs, recent: [id, ...prefs.recent.filter((r) => r !== id)].slice(0, RECENT_CAP) }
  saveLibraryPrefs(next, storage)
  return next
}

export function setCardSize(cardSize: LibraryPrefs['cardSize'], storage: Storage | undefined = defaultStorage()): LibraryPrefs {
  const next = { ...loadLibraryPrefs(storage), cardSize }
  saveLibraryPrefs(next, storage)
  return next
}

export function subscribeLibraryPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function currentPrefs(): LibraryPrefs {
  snapshot ??= loadLibraryPrefs()
  return snapshot
}

export function useLibraryPrefs(): LibraryPrefs {
  return useSyncExternalStore(subscribeLibraryPrefs, currentPrefs, currentPrefs)
}
