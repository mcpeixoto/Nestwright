import { newId } from './ids'
import type { Item, Level, Vec2 } from './types'

/** Plain copies of items, positions relative to the group's centre. */
export interface ItemClip {
  kind: 'nestwright-items'
  items: Item[]
}

function cloneItem(item: Item): Item {
  return {
    ...item,
    position: { ...item.position },
    size: { ...item.size },
    materials: Object.fromEntries(Object.entries(item.materials).map(([k, v]) => [k, { ...v }])),
    params: { ...item.params },
  }
}

export function groupCentre(items: readonly Pick<Item, 'position'>[]): Vec2 {
  if (items.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const item of items) {
    x += item.position.x
    y += item.position.y
  }
  return { x: x / items.length, y: y / items.length }
}

/** Copy the items of `ids` on `level`, keeping their layout around the group centre. */
export function copyItems(level: Level, ids: readonly string[]): ItemClip | null {
  const set = new Set(ids)
  const picked = level.items.filter((item) => set.has(item.id))
  if (picked.length === 0) return null
  const centre = groupCentre(picked)
  return {
    kind: 'nestwright-items',
    items: picked.map((item) => {
      const copy = cloneItem(item)
      copy.position = { x: item.position.x - centre.x, y: item.position.y - centre.y }
      delete copy.locked
      return copy
    }),
  }
}

/** Paste a clip centred on `at`, with new ids. Returns the new ids. */
export function pasteItems(level: Level, clip: ItemClip, at: Vec2): string[] {
  const created: string[] = []
  for (const source of clip.items) {
    const copy = cloneItem(source)
    copy.id = newId('item')
    copy.position = { x: at.x + source.position.x, y: at.y + source.position.y }
    level.items.push(copy)
    created.push(copy.id)
  }
  return created
}

/** Parse a clip from JSON (system clipboard); null when it is not one of ours. */
export function parseItemClip(text: string): ItemClip | null {
  try {
    const raw = JSON.parse(text) as Partial<ItemClip>
    if (raw?.kind !== 'nestwright-items' || !Array.isArray(raw.items)) return null
    const items = raw.items.filter(
      (item): item is Item =>
        !!item &&
        typeof item.catalogId === 'string' &&
        typeof item.position?.x === 'number' &&
        typeof item.position?.y === 'number' &&
        typeof item.size?.w === 'number',
    )
    return items.length > 0 ? { kind: 'nestwright-items', items } : null
  } catch {
    return null
  }
}

/** Turn a group of items about its centre; each item also turns in place. Locked items stay. */
export function rotateItemGroup(level: Level, ids: readonly string[], delta: number): void {
  const set = new Set(ids)
  const picked = level.items.filter((item) => set.has(item.id) && !item.locked)
  if (picked.length === 0) return
  const centre = groupCentre(picked)
  const c = Math.cos(delta)
  const s = Math.sin(delta)
  for (const item of picked) {
    const dx = item.position.x - centre.x
    const dy = item.position.y - centre.y
    item.position = { x: centre.x + dx * c - dy * s, y: centre.y + dx * s + dy * c }
    item.rotation += delta
  }
}
