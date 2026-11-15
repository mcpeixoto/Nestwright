import { getEntry } from '../catalog/registry'
import { en, type MessageKey } from './en'
import { translate } from './index'

const NAME_KEYS: Record<string, MessageKey> = {
  'sofa-3': 'catalog.sofa-3',
  armchair: 'catalog.armchair',
  'coffee-table': 'catalog.coffee-table',
  'dining-table': 'catalog.dining-table',
  'dining-chair': 'catalog.dining-chair',
  'bed-double': 'catalog.bed-double',
  'bed-single': 'catalog.bed-single',
  nightstand: 'catalog.nightstand',
  wardrobe: 'catalog.wardrobe',
  desk: 'catalog.desk',
  'office-chair': 'catalog.office-chair',
  bookshelf: 'catalog.bookshelf',
  'floor-lamp': 'catalog.floor-lamp',
  'pendant-lamp': 'catalog.pendant-lamp',
  rug: 'catalog.rug',
  'plant-pot': 'catalog.plant-pot',
  toilet: 'catalog.toilet',
  bathtub: 'catalog.bathtub',
  shower: 'catalog.shower',
  washbasin: 'catalog.washbasin',
}

const CATEGORY_KEYS: Record<string, MessageKey> = {
  living: 'category.living',
  dining: 'category.dining',
  bedroom: 'category.bedroom',
  kitchen: 'category.kitchen',
  bathroom: 'category.bathroom',
  office: 'category.office',
  outdoor: 'category.outdoor',
  lighting: 'category.lighting',
  decor: 'category.decor',
  plants: 'category.plants',
  structure: 'category.structure',
}

const MATERIAL_CATEGORY_KEYS: Record<string, MessageKey> = {
  Plaster: 'Plaster',
  Paint: 'PaintCat',
  Masonry: 'Masonry',
  Stone: 'Stone',
  Wood: 'Wood',
  Tile: 'Tile',
  Fabric: 'Fabric',
  Metal: 'Metal',
  Glass: 'Glass',
  Ground: 'Ground',
  Roof: 'Roof',
  Paper: 'Paper',
}

function known(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(en, key)
}

/**
 * Dictionary key for a catalog entry's name: the original `catalog.<id>` keys, otherwise the
 * English name itself. Undefined when the name has no translation yet.
 */
export function catalogNameKey(id: string, name: string): string | undefined {
  return NAME_KEYS[id] ?? (known(name) ? name : undefined)
}

/** Catalog display name. Untranslated names (imported models, packs) show as they are. */
export function catalogName(language: string, id: string, fallback: string): string {
  const key = catalogNameKey(id, fallback)
  return key ? translate(language, key) : fallback
}

/** Display name for a catalog id, for places that only hold the id (budget, wishes, plan). */
export function catalogNameById(language: string, id: string): string {
  const entry = getEntry(id)
  return entry ? catalogName(language, entry.id, entry.name) : id.replace(/-/g, ' ')
}

export function categoryNameKey(category: string): string | undefined {
  return CATEGORY_KEYS[category] ?? (known(category) ? category : undefined)
}

export function categoryName(language: string, category: string): string {
  const key = CATEGORY_KEYS[category]
  return key ? translate(language, key) : translate(language, category)
}

export function materialCategoryKey(category: string): string | undefined {
  return MATERIAL_CATEGORY_KEYS[category] ?? (known(category) ? category : undefined)
}

export function materialCategoryName(language: string, category: string): string {
  const key = MATERIAL_CATEGORY_KEYS[category]
  return key ? translate(language, key) : translate(language, category)
}

/** Parameter labels and enum options are keyed by their English text. */
export function paramLabelKey(label: string): string | undefined {
  return known(label) ? label : undefined
}

/**
 * Material-slot label key. A few slot names collide with a catalog or material name that reads
 * differently in Portuguese ("Linen" the fabric vs the bed linen), so those get a `slot.` key.
 */
export function slotLabelKey(slot: string, label: string): string {
  const scoped = `slot.${slot}`
  return known(scoped) ? scoped : label
}
