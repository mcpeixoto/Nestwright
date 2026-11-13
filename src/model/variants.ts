import { estimateBudget } from './budget'
import { createProject } from './defaults'
import { detectRooms } from './rooms'
import type { Budget, Level, Project, Terrain, Variant } from './types'

export const BEFORE_SWITCH_NAME = 'Before switching…'

export function variantFrom(project: Project, name: string, id: string, createdAt: number): Variant {
  return {
    id,
    name: name.trim() || 'Variant',
    createdAt,
    levels: structuredClone(project.levels ?? []),
    terrain: structuredClone(project.terrain),
  }
}

export interface VariantSwitch {
  levels: Level[]
  terrain: Terrain
  before: Variant
}

/** Current levels and terrain become an auto-variant so the switch can be undone by switching back. */
export function planSwitch(project: Project, variantId: string, beforeId: string, now: number): VariantSwitch | null {
  const variant = project.variants.find((item) => item.id === variantId)
  if (!variant) return null
  return {
    levels: structuredClone(variant.levels ?? []),
    terrain: structuredClone(variant.terrain),
    before: variantFrom(project, BEFORE_SWITCH_NAME, beforeId, now),
  }
}

export function renameVariant(variants: readonly Variant[], id: string, name: string): Variant[] {
  const trimmed = name.trim()
  if (!trimmed) return variants.slice()
  return variants.map((variant) => (variant.id === id ? { ...variant, name: trimmed } : variant))
}

export function deleteVariant(variants: readonly Variant[], id: string): Variant[] {
  return variants.filter((variant) => variant.id !== id)
}

export function duplicateVariant(variants: readonly Variant[], id: string, newId: string, now: number): Variant[] {
  const source = variants.find((variant) => variant.id === id)
  if (!source) return variants.slice()
  const copy = structuredClone(source)
  copy.id = newId
  copy.name = `${source.name} copy`
  copy.createdAt = now
  return [...variants, copy]
}

export interface VariantDiff {
  roomsAdded: string[]
  roomsRemoved: string[]
  areaBefore: number
  areaAfter: number
  areaChange: number
  itemsBefore: number
  itemsAfter: number
  itemChange: number
  costBefore: number
  costAfter: number
  costChange: number
}

interface RoomSnap {
  key: string
  name: string
  area: number
}

function roomSnaps(variant: Variant): RoomSnap[] {
  const out: RoomSnap[] = []
  for (const level of variant.levels ?? []) {
    for (const room of detectRooms(level)) {
      out.push({ key: `${level.id}:${room.key}`, name: room.name, area: room.area })
    }
  }
  return out
}

function itemCount(variant: Variant): number {
  let count = 0
  for (const level of variant.levels ?? []) count += level.items?.length ?? 0
  return count
}

function asProject(variant: Variant, budget: Budget): Project {
  const shell = createProject('diff', 'house')
  return { ...shell, levels: variant.levels ?? [], terrain: variant.terrain, budget }
}

const DEFAULT_RATES: Budget = { currency: 'EUR', buildCostPerM2: 1600, finishCostPerM2: {} }

/** `b` relative to `a`: added rooms are in b only. Cost uses the same rates for both. */
export function diffVariants(a: Variant, b: Variant, budget?: Budget): VariantDiff {
  const rates = budget ?? DEFAULT_RATES
  const before = roomSnaps(a)
  const after = roomSnaps(b)
  const beforeKeys = new Set(before.map((room) => room.key))
  const afterKeys = new Set(after.map((room) => room.key))
  const areaBefore = before.reduce((sum, room) => sum + room.area, 0)
  const areaAfter = after.reduce((sum, room) => sum + room.area, 0)
  const itemsBefore = itemCount(a)
  const itemsAfter = itemCount(b)
  const costBefore = estimateBudget(asProject(a, rates)).total
  const costAfter = estimateBudget(asProject(b, rates)).total
  return {
    roomsAdded: after.filter((room) => !beforeKeys.has(room.key)).map((room) => room.name),
    roomsRemoved: before.filter((room) => !afterKeys.has(room.key)).map((room) => room.name),
    areaBefore,
    areaAfter,
    areaChange: areaAfter - areaBefore,
    itemsBefore,
    itemsAfter,
    itemChange: itemsAfter - itemsBefore,
    costBefore,
    costAfter,
    costChange: costAfter - costBefore,
  }
}

export function summariseDiff(diff: VariantDiff): string {
  const area = `${diff.areaChange >= 0 ? '+' : ''}${diff.areaChange.toFixed(1)} m²`
  const items = `${diff.itemChange >= 0 ? '+' : ''}${diff.itemChange} items`
  const cost = `${diff.costChange >= 0 ? '+' : ''}${Math.round(diff.costChange)}`
  const added = diff.roomsAdded.length > 0 ? diff.roomsAdded.join(', ') : 'none'
  const removed = diff.roomsRemoved.length > 0 ? diff.roomsRemoved.join(', ') : 'none'
  return `Rooms added: ${added}. Removed: ${removed}. Area ${area}. ${items}. Cost ${cost}.`
}
