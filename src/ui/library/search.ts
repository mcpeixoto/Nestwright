import type { CatalogEntry } from '../../catalog/types'
import { catalogName } from '../../i18n/catalog'

/**
 * Library entries for a tab. With no needle, the tab's own category; with one, every entry
 * whose display name, English name or a tag contains it (search ignores the tab). For the
 * Favourites and Recently used tabs the caller passes the already-filtered list.
 */
export function searchEntries(entries: readonly CatalogEntry[], category: string, needle: string, language: string): CatalogEntry[] {
  const q = needle.trim().toLowerCase()
  if (!q) return entries.filter((e) => e.category === category)
  return entries.filter(
    (e) =>
      catalogName(language, e.id, e.name).toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.tags.some((tag) => tag.toLowerCase().includes(q)),
  )
}
