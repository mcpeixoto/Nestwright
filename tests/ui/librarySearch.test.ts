import { describe, expect, it } from 'vitest'
import type { CatalogEntry } from '../../src/catalog/types'
import { searchEntries } from '../../src/ui/library/search'

const entries = [
  { id: 'sofa-3', name: 'Three-seat sofa', category: 'living', tags: ['sofa'] },
  { id: 'bed-1', name: 'Double bed', category: 'bedroom', tags: ['bed'] },
] as unknown as CatalogEntry[]

describe('searchEntries', () => {
  it('lists the tab with no needle and searches every category with one', () => {
    expect(searchEntries(entries, 'living', '', 'en').map((e) => e.id)).toEqual(['sofa-3'])
    expect(searchEntries(entries, 'living', 'bed', 'en').map((e) => e.id)).toEqual(['bed-1'])
  })

  it('matches the Portuguese name and falls back to the English one', () => {
    expect(searchEntries(entries, 'bedroom', 'sofá', 'pt-PT').map((e) => e.id)).toEqual(['sofa-3'])
    expect(searchEntries(entries, 'bedroom', 'sofa', 'pt-PT').map((e) => e.id)).toEqual(['sofa-3'])
  })
})
