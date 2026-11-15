import { getEntry } from '../../catalog/registry'
import { translate } from '../../i18n'
import { catalogName } from '../../i18n/catalog'
import type { BudgetLine, BudgetSource } from '../../model/budget'

/** Line labels the estimate writes as plain English keys. */
const KNOWN_LABELS = new Set(['Construction', 'Floor', 'Walls', 'Pool', 'Fence'])

function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/**
 * What a budget line is called, in the player's language: catalog ids become the
 * furniture name, opening types and fixed labels go through the dictionary, and
 * labels the player typed (extras) are kept as written.
 */
export function budgetLineText(line: BudgetLine, language: string): string {
  if (KNOWN_LABELS.has(line.label)) return translate(language, line.label)
  if (line.category === 'openings') return translate(language, titleCase(line.label))
  if (line.category === 'items') {
    const entry = getEntry(line.label)
    return entry ? catalogName(language, entry.id, entry.name) : line.label
  }
  return line.label
}

export function budgetSourceKey(source: BudgetSource): string {
  switch (source) {
    case 'estimate':
      return 'Estimate'
    case 'catalog':
      return 'Catalog'
    case 'quote':
      return 'Quote'
    default: {
      const exhaustive: never = source
      return exhaustive
    }
  }
}
