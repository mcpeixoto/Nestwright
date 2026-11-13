import { pointInPolygon } from './geometry'
import { detectRooms } from './rooms'
import type { Level, Project, Room, Vec2, Wish } from './types'

export const REACTION_GLYPH: Record<Wish['reaction'], string> = {
  love: '❤',
  no: '✕',
  idea: '💡',
}

export function wishTargetKey(wish: Wish): string {
  const target = wish.target
  if (!target) return 'missing'
  if (target.kind === 'item') return `item:${target.id}`
  if (target.kind === 'room') return `room:${target.key}`
  return `point:${target.levelId}:${target.at.x}:${target.at.y}`
}

export interface Disagreement {
  key: string
  target: Wish['target']
  loves: Wish[]
  nos: Wish[]
}

/** A ❤ and a ✕ on the same target, from two different people. */
export function disagreements(wishes: readonly Wish[]): Disagreement[] {
  const groups = new Map<string, Wish[]>()
  for (const wish of wishes) {
    if (wish.resolved) continue
    if (wish.reaction !== 'love' && wish.reaction !== 'no') continue
    const key = wishTargetKey(wish)
    const list = groups.get(key)
    if (list) list.push(wish)
    else groups.set(key, [wish])
  }
  const out: Disagreement[] = []
  for (const [key, list] of groups) {
    const loves = list.filter((wish) => wish.reaction === 'love')
    const nos = list.filter((wish) => wish.reaction === 'no')
    const cross = loves.some((love) => nos.some((no) => no.author !== love.author))
    const first = list[0]
    if (!cross || !first) continue
    out.push({ key, target: first.target, loves, nos })
  }
  return out
}

export interface WishGroup {
  key: string
  name: string
  wishes: Wish[]
}

function roomOf(level: Level, point: Vec2): Room | null {
  for (const room of detectRooms(level)) {
    if (pointInPolygon(point, room.polygon)) return room
  }
  return null
}

function placeOf(project: Project, wish: Wish): { key: string; name: string } {
  const target = wish.target
  if (!target) return { key: '', name: 'Not in a room' }
  if (target.kind === 'room') {
    for (const level of project.levels ?? []) {
      const room = detectRooms(level).find((item) => item.key === target.key)
      if (room) return { key: room.key, name: room.name }
    }
    return { key: target.key, name: 'Missing room' }
  }
  let level: Level | undefined
  let point: Vec2 | null = null
  if (target.kind === 'point') {
    level = project.levels?.find((item) => item.id === target.levelId)
    point = target.at ?? null
  } else {
    for (const candidate of project.levels ?? []) {
      const item = candidate.items.find((entry) => entry.id === target.id)
      if (!item) continue
      level = candidate
      point = item.position
      break
    }
  }
  if (level && point) {
    const room = roomOf(level, point)
    if (room) return { key: room.key, name: room.name }
  }
  return { key: '', name: 'Not in a room' }
}

export function groupWishes(project: Project, wishes: readonly Wish[]): WishGroup[] {
  const buckets = new Map<string, WishGroup>()
  for (const wish of wishes) {
    const place = placeOf(project, wish)
    let group = buckets.get(place.key)
    if (!group) {
      group = { key: place.key, name: place.name, wishes: [] }
      buckets.set(place.key, group)
    }
    group.wishes.push(wish)
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.key === '') return 1
    if (b.key === '') return -1
    return a.name.localeCompare(b.name)
  })
}

/** World position for a pin. Plan y is world z. */
export function wishAnchor(project: Project, wish: Wish): { x: number; y: number; z: number } | null {
  const target = wish.target
  if (!target) return null
  if (target.kind === 'point') {
    const level = project.levels?.find((item) => item.id === target.levelId)
    if (!level || !target.at || !Number.isFinite(target.at.x) || !Number.isFinite(target.at.y)) return null
    return { x: target.at.x, y: level.elevation + 1.2, z: target.at.y }
  }
  if (target.kind === 'item') {
    for (const level of project.levels ?? []) {
      const item = level.items.find((entry) => entry.id === target.id)
      if (!item) continue
      const height = Number.isFinite(item.size?.h) ? item.size.h : 0
      return { x: item.position.x, y: level.elevation + item.elevation + height + 0.25, z: item.position.y }
    }
    return null
  }
  for (const level of project.levels ?? []) {
    const room = detectRooms(level).find((item) => item.key === target.key)
    if (!room) continue
    return { x: room.centroid.x, y: level.elevation + 1.6, z: room.centroid.y }
  }
  return null
}

export function describeTarget(project: Project, wish: Wish): string {
  const target = wish.target
  if (!target) return 'Unknown'
  if (target.kind === 'item') {
    for (const level of project.levels ?? []) {
      if (level.items.some((item) => item.id === target.id)) return 'Item'
    }
    return 'Missing item'
  }
  if (target.kind === 'room') {
    for (const level of project.levels ?? []) {
      const room = detectRooms(level).find((item) => item.key === target.key)
      if (room) return room.name
    }
    return 'Missing room'
  }
  const level = project.levels?.find((item) => item.id === target.levelId)
  return level ? `Point on ${level.name}` : 'Point'
}

/**
 * `selection` reacts to the current selection (one item, or every wall of a room).
 * `point` reacts to the plan cursor: the room under it, or the point itself.
 */
export function targetFromSelection(
  level: Level | null,
  rooms: readonly Room[],
  selection: readonly string[],
  cursor: Vec2 | null,
  mode: 'selection' | 'point',
): Wish['target'] | null {
  if (!level) return null
  if (mode === 'selection') {
    for (const id of selection) {
      if (level.items.some((item) => item.id === id)) return { kind: 'item', id }
    }
    if (selection.length === 0) return null
    const key = [...selection].sort().join(',')
    if (rooms.some((room) => room.key === key)) return { kind: 'room', key }
    return null
  }
  if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return null
  const room = rooms.find((item) => pointInPolygon(cursor, item.polygon))
  if (room) return { kind: 'room', key: room.key }
  return { kind: 'point', levelId: level.id, at: { x: cursor.x, y: cursor.y } }
}
