import type { CatalogEntry } from './types'
import { CATEGORIES } from './types'

const entries = new Map<string, CatalogEntry>()

export function registerEntries(list: readonly CatalogEntry[]): void {
  for (const entry of list) entries.set(entry.id, entry)
}

export function getEntry(id: string): CatalogEntry | undefined {
  return entries.get(id)
}

export function listEntries(category?: string): CatalogEntry[] {
  const all = [...entries.values()]
  if (!category) return all
  return all.filter((e) => e.category === category)
}

export { CATEGORIES }
