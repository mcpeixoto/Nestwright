import { createOpening, createWall } from '../defaults'
import { add, dist, pointInPolygon, segmentIntersection, sub } from '../geometry'
import { newId } from '../ids'
import { detectRooms } from '../rooms'
import type { Item, Level, Opening, OpeningType, Vec2, Wall } from '../types'
import {
  JOIN_EPS,
  locateOnWall,
  openingFits,
  pointAlongWall,
  splitWall,
  wallFrame,
  wallLength,
} from '../walls'

export interface WallProps {
  thickness?: number
  height?: number
  bulge?: number
  left?: Wall['left']
  right?: Wall['right']
  kind?: Wall['kind']
}

/** Endpoints this close to a corner or a wall face are pulled onto it when drawing. */
export const MERGE_SNAP = 0.05

/** Corners first (nearest within `radius`), then the nearest point strictly inside a wall. */
function mergePoint(level: Level, p: Vec2, radius = MERGE_SNAP): Vec2 {
  let corner: Vec2 | null = null
  let cornerD = radius
  for (const wall of level.walls) {
    for (const q of [wall.a, wall.b]) {
      const d = dist(p, q)
      if (d <= cornerD) {
        corner = { x: q.x, y: q.y }
        cornerD = d
      }
    }
  }
  if (corner) return corner
  let best = { x: p.x, y: p.y }
  let bestD = radius
  for (const wall of level.walls) {
    const loc = locateOnWall(wall, p)
    if (
      loc.distanceToWall <= bestD &&
      loc.distance > JOIN_EPS &&
      loc.distance < loc.length - JOIN_EPS
    ) {
      best = { x: loc.point.x, y: loc.point.y }
      bestD = loc.distanceToWall
    }
  }
  return best
}

function splitExistingAt(level: Level, p: Vec2): void {
  const ids = level.walls.map((w) => w.id)
  for (const id of ids) {
    const wall = level.walls.find((w) => w.id === id)
    if (!wall) continue
    const loc = locateOnWall(wall, p)
    if (loc.distanceToWall <= JOIN_EPS && loc.distance > JOIN_EPS && loc.distance < loc.length - JOIN_EPS) {
      splitWall(level, id, loc.point)
    }
  }
}

function shatter(level: Level, wallId: string, points: Vec2[]): string[] {
  const ids = [wallId]
  let current = wallId
  const origin = level.walls.find((w) => w.id === wallId)
  if (!origin) return ids
  const ordered = points
    .map((p) => ({ p, d: locateOnWall(origin, p).distance }))
    .filter((x) => x.d > JOIN_EPS && x.d < wallLength(origin) - JOIN_EPS)
    .sort((a, b) => a.d - b.d)
  for (const { p } of ordered) {
    if (!level.walls.some((w) => w.id === current)) break
    const result = splitWall(level, current, p)
    if (result) {
      ids.push(result.b.id)
      current = result.b.id
    }
  }
  return ids
}

function crossings(wall: Wall, a: Vec2, b: Vec2): Vec2[] {
  const hits: Vec2[] = []
  const frame = wallFrame(wall)
  const span = dist(a, b)
  for (let i = 0; i < frame.points.length - 1; i++) {
    const p0 = frame.points[i]
    const p1 = frame.points[i + 1]
    if (!p0 || !p1) continue
    const hit = segmentIntersection(a, b, p0, p1)
    if (!hit) continue
    const alongNew = span * hit.t
    const alongWall = (frame.cum[i] ?? 0) + dist(p0, p1) * hit.u
    if (
      alongNew > JOIN_EPS &&
      alongNew < span - JOIN_EPS &&
      alongWall > JOIN_EPS &&
      alongWall < frame.length - JOIN_EPS
    ) {
      hits.push(hit.point)
    }
  }
  return hits
}

function pointOnNewWall(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; distance: number } | null {
  const ab = sub(b, a)
  const l2 = ab.x * ab.x + ab.y * ab.y
  if (l2 < 1e-12) return null
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2))
  const point = { x: a.x + ab.x * t, y: a.y + ab.y * t }
  return { t, point, distance: dist(p, point) }
}

/**
 * Add a chain of walls. Endpoints within `MERGE_SNAP` of an existing corner or
 * wall are pulled onto it, existing ends that near the new wall's interior join it, and any wall that gains a T-junction or crossing is split there.
 */
export function addWallChain(level: Level, points: readonly Vec2[], props: WallProps = {}): string[] {
  const ids: string[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const rawA = points[i]
    const rawB = points[i + 1]
    if (!rawA || !rawB) continue
    let a = mergePoint(level, rawA)
    let b = mergePoint(level, rawB)
    if (dist(a, b) < JOIN_EPS) continue
    splitExistingAt(level, a)
    splitExistingAt(level, b)
    a = mergePoint(level, a)
    b = mergePoint(level, b)
    if (dist(a, b) < JOIN_EPS) continue

    const hits: Vec2[] = []
    for (const wall of [...level.walls]) {
      hits.push(...crossings(wall, a, b))
      for (const end of ['a', 'b'] as const) {
        const q = wall[end]
        const on = pointOnNewWall(q, a, b)
        if (on && on.distance <= MERGE_SNAP && on.t > 0.0001 && on.t < 0.9999) {
          // An existing end near the new wall's interior is pulled onto it, making a T.
          if (on.distance > 0) moveWallEndpoint(level, wall.id, end, on.point)
          hits.push({ x: on.point.x, y: on.point.y })
        }
      }
    }
    for (const hit of hits) splitExistingAt(level, hit)

    const wall = createWall(a, b, props)
    level.walls.push(wall)
    ids.push(...shatter(level, wall.id, hits))
  }
  return ids
}

/**
 * Move one endpoint. Every wall that shares the joint (within 1 mm) follows,
 * and openings keep their world position as well as they can.
 */
export function moveWallEndpoint(level: Level, wallId: string, end: 'a' | 'b', to: Vec2): void {
  const wall = level.walls.find((w) => w.id === wallId)
  if (!wall) return
  const from = { x: wall[end].x, y: wall[end].y }
  const affected = level.walls.filter((w) => dist(w.a, from) <= JOIN_EPS || dist(w.b, from) <= JOIN_EPS)
  const saved = new Map<string, Vec2>()
  for (const w of affected) {
    for (const opening of level.openings) {
      if (opening.wallId === w.id) saved.set(opening.id, pointAlongWall(w, opening.offset))
    }
  }
  const target = { x: to.x, y: to.y }
  for (const w of level.walls) {
    if (dist(w.a, from) <= JOIN_EPS) w.a = { x: target.x, y: target.y }
    if (dist(w.b, from) <= JOIN_EPS) w.b = { x: target.x, y: target.y }
  }
  for (const w of affected) {
    const length = wallLength(w)
    for (const opening of level.openings) {
      if (opening.wallId !== w.id) continue
      const center = saved.get(opening.id)
      if (!center) continue
      const loc = locateOnWall(w, center)
      const half = opening.width / 2
      const hi = Math.max(half, length - half)
      opening.offset = Math.min(hi, Math.max(half, loc.distance))
    }
  }
  // A joint dropped onto another wall's interior splits it, so the T stays a graph node.
  splitExistingAt(level, target)
}

/**
 * Translate every wall that bounds `roomKey`. Shared walls move with it, so
 * neighbouring rooms stay attached. Openings ride their walls; items, stairs
 * and columns inside the room move by the same delta.
 */
export function moveRoom(level: Level, roomKey: string, delta: Vec2): void {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return
  if (Math.hypot(delta.x, delta.y) < 1e-9) return
  const room = detectRooms(level).find((item) => item.key === roomKey)
  if (!room) return
  const wallIds = new Set(room.key.split(',').filter(Boolean))
  const joints: Vec2[] = []
  for (const wall of level.walls) {
    if (!wallIds.has(wall.id)) continue
    joints.push({ x: wall.a.x, y: wall.a.y }, { x: wall.b.x, y: wall.b.y })
  }
  for (const wall of level.walls) {
    if (joints.some((joint) => dist(wall.a, joint) <= JOIN_EPS)) wall.a = add(wall.a, delta)
    if (joints.some((joint) => dist(wall.b, joint) <= JOIN_EPS)) wall.b = add(wall.b, delta)
  }
  const inside = room.polygon
  for (const item of level.items) {
    if (item.locked || !pointInPolygon(item.position, inside)) continue
    item.position = add(item.position, delta)
  }
  for (const stair of level.stairs) {
    if (pointInPolygon(stair.position, inside)) stair.position = add(stair.position, delta)
  }
  for (const column of level.columns) {
    if (pointInPolygon(column.position, inside)) column.position = add(column.position, delta)
  }
}

/** Translate a wall. Joints move with it, so the walls that share them stretch. */
export function moveWall(level: Level, wallId: string, delta: Vec2): void {
  const wall = level.walls.find((w) => w.id === wallId)
  if (!wall) return
  const a0 = { x: wall.a.x, y: wall.a.y }
  const b0 = { x: wall.b.x, y: wall.b.y }
  moveWallEndpoint(level, wallId, 'a', add(a0, delta))
  moveWallEndpoint(level, wallId, 'b', add(b0, delta))
}

export function deleteEntities(level: Level, ids: readonly string[]): void {
  const drop = new Set(ids)
  const wallIds = new Set(level.walls.filter((w) => drop.has(w.id)).map((w) => w.id))
  level.walls = level.walls.filter((w) => !drop.has(w.id))
  level.openings = level.openings.filter((o) => !drop.has(o.id) && !wallIds.has(o.wallId))
  level.items = level.items.filter((i) => !drop.has(i.id))
  level.stairs = level.stairs.filter((s) => !drop.has(s.id))
  level.roofs = level.roofs.filter((r) => !drop.has(r.id))
  level.columns = level.columns.filter((c) => !drop.has(c.id))
  level.slabs = level.slabs.filter((s) => !drop.has(s.id))
  level.dimensions = level.dimensions.filter((d) => !drop.has(d.id))
  level.rooms = level.rooms.filter((room) => room.key.split(',').every((id) => !wallIds.has(id)))
}

export function addOpening(level: Level, opening: Opening): boolean {
  const wall = level.walls.find((w) => w.id === opening.wallId)
  if (!wall) return false
  if (!openingFits(wall, opening, level.openings)) return false
  level.openings.push(opening)
  return true
}

export function placeOpening(level: Level, type: OpeningType, wallId: string, offset: number): Opening | null {
  const wall = level.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const opening = createOpening(type, wallId, offset)
  if (!addOpening(level, opening)) return null
  return opening
}

export function addItem(level: Level, item: Item): void {
  level.items.push(item)
}

export function moveItems(level: Level, ids: readonly string[], delta: Vec2): void {
  const set = new Set(ids)
  for (const item of level.items) {
    if (!set.has(item.id) || item.locked) continue
    item.position = { x: item.position.x + delta.x, y: item.position.y + delta.y }
  }
}

export function rotateItems(level: Level, ids: readonly string[], deltaRad: number): void {
  const set = new Set(ids)
  for (const item of level.items) {
    if (!set.has(item.id) || item.locked) continue
    item.rotation += deltaRad
  }
}

export function duplicateItems(level: Level, ids: readonly string[], delta: Vec2 = { x: 0.2, y: 0.2 }): string[] {
  const set = new Set(ids)
  const created: string[] = []
  const copies: Item[] = []
  for (const item of level.items) {
    if (!set.has(item.id)) continue
    const id = newId('item')
    copies.push({
      ...item,
      id,
      position: add(item.position, delta),
      size: { ...item.size },
      materials: Object.fromEntries(Object.entries(item.materials).map(([k, v]) => [k, { ...v }])),
      params: { ...item.params },
    })
    created.push(id)
  }
  level.items.push(...copies)
  return created
}
