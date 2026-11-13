import type { MessageKey } from './en'
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

/** Catalog display name. Unknown ids keep the entry's own name. */
export function catalogName(language: string, id: string, fallback: string): string {
  const key = NAME_KEYS[id]
  return key ? translate(language, key) : fallback
}

export function categoryName(language: string, category: string): string {
  const key = CATEGORY_KEYS[category]
  return key ? translate(language, key) : translate(language, category)
}

export function materialCategoryName(language: string, category: string): string {
  const key = MATERIAL_CATEGORY_KEYS[category]
  return key ? translate(language, key) : category
}
