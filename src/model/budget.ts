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

export type BudgetCategory = 'construction' | 'finishes' | 'openings' | 'items' | 'terrain'

export interface BudgetLine {
  category: BudgetCategory
  roomKey: string
  roomName: string
  label: string
  amount: number
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

const OUTSIDE = ''

function finite(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return value
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
  const overrides = project.budget?.finishCostPerM2
  const names = new Map<string, string>([[OUTSIDE, 'Outside']])
  const lines: BudgetLine[] = []

  const add = (roomKey: string, roomName: string, category: BudgetCategory, label: string, amount: number) => {
    const value = finite(amount)
    if (value <= 0) return
    names.set(roomKey, roomName)
    lines.push({ category, roomKey, roomName, label, amount: value })
  }

  for (const level of project.levels ?? []) {
    const rooms = detectRooms(level)
    for (const room of rooms) names.set(room.key, room.name)
    for (const room of rooms) {
      add(room.key, room.name, 'construction', 'Construction', room.area * rate)
      add(room.key, room.name, 'finishes', 'Floor', materialCost(room.floor?.id, overrides) * room.area)
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
        add(key, name, 'finishes', 'Walls', side * materialCost(material, overrides))
      }
    }
    for (const opening of level.openings ?? []) {
      const price = OPENING_PRICES[opening.type] ?? 0
      const wall = level.walls.find((item) => item.id === opening.wallId)
      const room = wall ? (roomAt(rooms, sidePoint(wall, 'left')) ?? roomAt(rooms, sidePoint(wall, 'right'))) : null
      add(room?.key ?? OUTSIDE, room?.name ?? 'Outside', 'openings', opening.type, price)
    }
    for (const item of level.items ?? []) {
      const room = roomAt(rooms, item.position)
      add(room?.key ?? OUTSIDE, room?.name ?? 'Outside', 'items', item.catalogId, itemCost(item.catalogId, item.price))
    }
  }

  for (const water of project.terrain?.water ?? []) {
    if (water.kind !== 'pool' || !water.polygon) continue
    add(OUTSIDE, 'Outside', 'terrain', 'Pool', Math.abs(polygonArea(water.polygon)) * POOL_COST_PER_M2)
  }
  for (const fence of project.terrain?.fences ?? []) {
    const points = fence.points ?? []
    let length = 0
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      if (a && b) length += dist(a, b)
    }
    add(OUTSIDE, 'Outside', 'terrain', 'Fence', length * FENCE_COST_PER_M)
  }

  const byCategory: Record<BudgetCategory, number> = {
    construction: 0,
    finishes: 0,
    openings: 0,
    items: 0,
    terrain: 0,
  }
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
  const total = byRoom.reduce((sum, room) => sum + room.total, 0)
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
