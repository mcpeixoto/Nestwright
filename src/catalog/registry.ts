import { fitUVsToScale } from '../builders/uv'
import { occupy } from './parts'
import type { CatalogEntry } from './types'
import { CATEGORIES } from './types'

const entries = new Map<string, CatalogEntry>()

function sized(entry: CatalogEntry): CatalogEntry {
  const build = entry.build
  return {
    ...entry,
    build(ctx) {
      const group = build(ctx)
      fitUVsToScale(group)
      occupy(group, ctx.size)
      return group
    },
  }
}

export function registerEntries(list: readonly CatalogEntry[]): void {
  for (const entry of list) entries.set(entry.id, sized(entry))
}

export function getEntry(id: string): CatalogEntry | undefined {
  return entries.get(id)
}

export function unregisterEntry(id: string): void {
  entries.delete(id)
}

export function listEntries(category?: string): CatalogEntry[] {
  const all = [...entries.values()]
  if (!category) return all
  return all.filter((e) => e.category === category)
}

export { CATEGORIES }
