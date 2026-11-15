import { getEntry } from '../catalog/registry'
import { getMaterialDef } from '../materials/library'
import { dist, pointInPolygon, polygonArea } from './geometry'
import { detectRooms } from './rooms'
import type { Level, OpeningType, Project, Room, Vec2, Wall } from './types'
import { wallLength } from './walls'

/** Default opening prices in the project currency. Overridable only by editing the file. */
export const OPENING_PRICES: Record<OpeningType, number> = {
  door: 350,
  'double-door': 620,
  'sliding-door': 890,
  'garage-door': 1400,
  arch: 180,
  window: 420,
  'fixed-window': 380,
  'tall-window': 640,
  'round-window': 510,
  'corner-window': 760,
}

export const POOL_COST_PER_M2 = 220
export const FENCE_COST_PER_M = 75

export type BudgetCategory =
  | 'construction'
  | 'finishes'
  | 'openings'
  | 'items'
  | 'terrain'
  | 'labour'
  | 'fees'
  | 'other'

export const BUDGET_CATEGORIES: readonly BudgetCategory[] = [
  'construction',
  'finishes',
  'openings',
  'items',
  'terrain',
  'labour',
  'fees',
  'other',
]

const categoriesCovered: BudgetCategory extends (typeof BUDGET_CATEGORIES)[number] ? true : never = true
void categoriesCovered

/** Where a line's money came from. A line quote always wins and is reported as `quote`. */
export type BudgetSource = 'estimate' | 'catalog' | 'quote'

export interface BudgetLine {
  /** Stable id: category plus a room key, wall face, opening id, item id, or extra id. */
  id: string
  category: BudgetCategory
  roomKey: string
  roomName: string
  label: string
  /** Measured quantity (m², metres, or a count of 1). */
  quantity: number
  unitPrice: number
  amount: number
  source: BudgetSource
}

export interface RoomTotal {
  key: string
  name: string
  total: number
}

export interface BudgetEstimate {
  currency: string
  total: number
  byCategory: Record<BudgetCategory, number>
  byRoom: RoomTotal[]
  lines: BudgetLine[]
  target: number | null
  /** Positive when the estimate is under the target. */
  delta: number | null
}

export interface VariantBudgetRow {
  id: string
  name: string
  total: number
  byCategory: Record<BudgetCategory, number>
  /** Signed difference from the current design. Zero on the current row. */
  difference: number
}

const OUTSIDE = ''

function finite(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return value
}

function emptyCategories(): Record<BudgetCategory, number> {
  return {
    construction: 0,
    finishes: 0,
    openings: 0,
    items: 0,
    terrain: 0,
    labour: 0,
    fees: 0,
    other: 0,
  }
}

function materialCost(id: string | undefined, overrides: Record<string, number> | undefined): number {
  if (!id) return 0
  const custom = overrides?.[id]
  if (typeof custom === 'number' && Number.isFinite(custom) && custom >= 0) return custom
  return getMaterialDef(id)?.costPerM2 ?? 0
}

function itemCost(catalogId: string, explicit: number | undefined): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) return explicit
  return getEntry(catalogId)?.price ?? 0
}

function quoteFor(overrides: Record<string, number> | undefined, id: string): number | null {
  const value = overrides?.[id]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

/** i18n key for a category. The switch is exhaustive so a new category cannot be silent. */
export function budgetCategoryKey(category: BudgetCategory): string {
  switch (category) {
    case 'construction':
      return 'Construction'
    case 'finishes':
      return 'Finishes'
    case 'openings':
      return 'Openings'
    case 'items':
      return 'Items'
    case 'terrain':
      return 'Outside'
    case 'labour':
      return 'Labour'
    case 'fees':
      return 'Fees'
    case 'other':
      return 'Other'
    default: {
      const exhaustive: never = category
      return exhaustive
    }
  }
}

function sidePoint(wall: Wall, side: 'left' | 'right'): Vec2 {
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const length = Math.hypot(dx, dy)
  if (length < 1e-8) return mid
  const leftX = -dy / length
  const leftY = dx / length
  const mag = finite(wall.thickness) / 2 + 0.05
  const sign = side === 'left' ? 1 : -1
  return { x: mid.x + leftX * mag * sign, y: mid.y + leftY * mag * sign }
}

function roomAt(rooms: readonly Room[], point: Vec2): Room | null {
  for (const room of rooms) {
    if (pointInPolygon(point, room.polygon)) return room
  }
  return null
}

function holeArea(level: Level, wall: Wall): number {
  let hole = 0
  for (const opening of level.openings ?? []) {
    if (opening.wallId !== wall.id) continue
    const height = Math.min(finite(opening.height), finite(wall.height))
    hole += finite(opening.width) * height
  }
  return hole
}

export function estimateBudget(project: Project): BudgetEstimate {
  const currency = project.budget?.currency?.trim() || 'EUR'
  const rate = finite(project.budget?.buildCostPerM2)
  const finishRates = project.budget?.finishCostPerM2
  const quotes = project.budget?.overrides
  const names = new Map<string, string>([[OUTSIDE, 'Outside']])
  const lines: BudgetLine[] = []

  const push = (
    id: string,
    roomKey: string,
    roomName: string,
    category: BudgetCategory,
    label: string,
    quantity: number,
    unitPrice: number,
    source: BudgetSource,
  ) => {
    const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
    const unit = finite(unitPrice)
    const computed = qty * unit
    const quote = quoteFor(quotes, id)
    if (quote == null && computed <= 0) return
    names.set(roomKey, roomName)
    lines.push({
      id,
      category,
      roomKey,
      roomName,
      label,
      quantity: quote != null && qty <= 0 ? 1 : qty,
      unitPrice: quote != null ? (qty > 0 ? quote / qty : quote) : unit,
      amount: quote ?? computed,
      source: quote != null ? 'quote' : source,
    })
  }

  for (const level of project.levels ?? []) {
    const rooms = detectRooms(level)
    for (const room of rooms) names.set(room.key, room.name)
    for (const room of rooms) {
      // Construction stays on the centre-line area (`room.area`), not the net area inside the faces.
      push(
        `construction:${level.id}:${room.key}`,
        room.key,
        room.name,
        'construction',
        'Construction',
        room.area,
        rate,
        'estimate',
      )
      push(
        `finishes:floor:${level.id}:${room.key}`,
        room.key,
        room.name,
        'finishes',
        'Floor',
        room.area,
        materialCost(room.floor?.id, finishRates),
        'catalog',
      )
    }
    for (const wall of level.walls ?? []) {
      const length = wallLength(wall)
      const height = finite(wall.height)
      if (length <= 0 || height <= 0) continue
      const side = Math.max(0, length * height - holeArea(level, wall))
      if (side <= 0) continue
      for (const face of ['left', 'right'] as const) {
        const room = roomAt(rooms, sidePoint(wall, face))
        const key = room?.key ?? OUTSIDE
        const name = room?.name ?? 'Outside'
        const material = face === 'left' ? wall.left?.id : wall.right?.id
        push(
          `finishes:wall:${wall.id}:${face}`,
          key,
          name,
          'finishes',
          'Walls',
          side,
          materialCost(material, finishRates),
          'catalog',
        )
      }
    }
    for (const opening of level.openings ?? []) {
      const price = OPENING_PRICES[opening.type] ?? 0
      const wall = level.walls.find((item) => item.id === opening.wallId)
      const room = wall ? (roomAt(rooms, sidePoint(wall, 'left')) ?? roomAt(rooms, sidePoint(wall, 'right'))) : null
      push(
        `openings:${opening.id}`,
        room?.key ?? OUTSIDE,
        room?.name ?? 'Outside',
        'openings',
        opening.type,
        1,
        price,
        'estimate',
      )
    }
    for (const item of level.items ?? []) {
      const room = roomAt(rooms, item.position)
      const explicit = typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
      push(
        `items:${item.id}`,
        room?.key ?? OUTSIDE,
        room?.name ?? 'Outside',
        'items',
        item.catalogId,
        1,
        itemCost(item.catalogId, item.price),
        explicit ? 'quote' : 'catalog',
      )
    }
  }

  for (const water of project.terrain?.water ?? []) {
    if (water.kind !== 'pool' || !water.polygon) continue
    const area = Math.abs(polygonArea(water.polygon))
    push(`terrain:pool:${water.id}`, OUTSIDE, 'Outside', 'terrain', 'Pool', area, POOL_COST_PER_M2, 'estimate')
  }
  for (const fence of project.terrain?.fences ?? []) {
    const points = fence.points ?? []
    let length = 0
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      if (a && b) length += dist(a, b)
    }
    push(`terrain:fence:${fence.id}`, OUTSIDE, 'Outside', 'terrain', 'Fence', length, FENCE_COST_PER_M, 'estimate')
  }

  for (const extra of project.budget?.extras ?? []) {
    if (!extra || typeof extra.id !== 'string' || !extra.id) continue
    const kind = extra.kind
    if (kind !== 'labour' && kind !== 'fees' && kind !== 'other') continue
    const label = typeof extra.label === 'string' && extra.label.trim() ? extra.label.trim() : kind
    push(`extra:${extra.id}`, `extra:${extra.id}`, label, kind, label, 1, finite(extra.amount), 'quote')
  }

  const byCategory = emptyCategories()
  const roomSums = new Map<string, number>()
  for (const line of lines) {
    byCategory[line.category] += line.amount
    roomSums.set(line.roomKey, (roomSums.get(line.roomKey) ?? 0) + line.amount)
  }
  const byRoom: RoomTotal[] = [...roomSums.entries()]
    .map(([key, total]) => ({ key, name: names.get(key) ?? 'Room', total }))
    .sort((a, b) => {
      if (a.key === OUTSIDE) return 1
      if (b.key === OUTSIDE) return -1
      return a.name.localeCompare(b.name)
    })
  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  const rawTarget = project.budget?.target
  const target = typeof rawTarget === 'number' && Number.isFinite(rawTarget) && rawTarget >= 0 ? rawTarget : null
  return {
    currency,
    total,
    byCategory,
    byRoom,
    lines,
    target,
    delta: target == null ? null : target - total,
  }
}

/**
 * Totals for the current design and each saved variant.
 * A variant is priced from its own levels and terrain with the current budget settings
 * (rates, line quotes and extras), so the comparison is the design, not a different price book.
 */
export function variantBudgets(project: Project): VariantBudgetRow[] {
  const current = estimateBudget(project)
  const rows: VariantBudgetRow[] = [
    {
      id: 'current',
      name: project.name?.trim() || 'Current',
      total: current.total,
      byCategory: { ...current.byCategory },
      difference: 0,
    },
  ]
  for (const variant of project.variants ?? []) {
    if (!variant || typeof variant.id !== 'string') continue
    const estimate = estimateBudget({
      ...project,
      levels: variant.levels ?? [],
      terrain: variant.terrain ?? project.terrain,
    })
    rows.push({
      id: variant.id,
      name: typeof variant.name === 'string' && variant.name.trim() ? variant.name.trim() : 'Variant',
      total: estimate.total,
      byCategory: { ...estimate.byCategory },
      difference: estimate.total - current.total,
    })
  }
  return rows
}
