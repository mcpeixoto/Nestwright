import { describe, expect, it } from 'vitest'
import { LIBRARY_PREFS_KEY, loadLibraryPrefs, noteRecent, toggleFavourite } from '../../src/ui/library/prefs'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

describe('library prefs', () => {
  it('defaults, toggles favourites and keeps a capped recent list', () => {
    const storage = memoryStorage()
    expect(loadLibraryPrefs(storage)).toEqual({ favourites: [], recent: [], cardSize: 'small' })
    expect(toggleFavourite('a', storage).favourites).toEqual(['a'])
    expect(toggleFavourite('a', storage).favourites).toEqual([])
    for (let i = 0; i < 14; i++) noteRecent(`id${i}`, storage)
    noteRecent('id5', storage)
    const recent = loadLibraryPrefs(storage).recent
    expect(recent[0]).toBe('id5')
    expect(recent).toHaveLength(12)
    expect(new Set(recent).size).toBe(12)
  })

  it('falls back to the defaults on corrupt JSON', () => {
    const storage = memoryStorage()
    storage.setItem(LIBRARY_PREFS_KEY, '{nope')
    expect(loadLibraryPrefs(storage)).toEqual({ favourites: [], recent: [], cardSize: 'small' })
  })
})
