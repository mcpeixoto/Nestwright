import { solidSegments } from './collision'
import type { Item, Level, Opening, Vec2, Wall } from './types'
import { openingInterval, pointAlongWall, wallDirection } from './walls'

/** Penetration below this is touching, not overlapping. */
export const OVERLAP_EPS = 0.005
/** Items lower than this are flat (rugs, mats) and never collide. */
export const FLAT_HEIGHT = 0.03
/** Narrowest comfortable walkway. */
export const WALKWAY_MIN = 0.9
/** Gaps up to this are items standing against each other, not a walkway. */
export const WALKWAY_TOUCH = 0.05
/** Two edges must face each other over at least this length to form a passage. */
export const WALKWAY_OVERLAP = 0.4
/** Items whose base is higher than this (wall cabinets, pendants) do not block a walkway. */
export const WALKWAY_MAX_BASE = 0.5
/** Rotations closer than this (mod 90°) count as parallel. */
export const PARALLEL_TOL = (2 * Math.PI) / 180

export function isFlatItem(item: Pick<Item, 'size' | 'catalogId'>): boolean {
  return item.size.h < FLAT_HEIGHT || /(^|-)rug(-|$)/.test(item.catalogId)
}

/** Plan rectangle of an item, counter-clockwise rotation, w along local x and d along local y. */
export function itemFootprint(item: Pick<Item, 'position' | 'rotation' | 'size'>): Vec2[] {
  const hw = item.size.w / 2
  const hd = item.size.d / 2
  const c = Math.cos(item.rotation)
  const s = Math.sin(item.rotation)
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => ({ x: item.position.x + p.x * c - p.y * s, y: item.position.y + p.x * s + p.y * c }))
}

function project(poly: readonly Vec2[], axis: Vec2): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of poly) {
    const v = p.x * axis.x + p.y * axis.y
    if (v < min) min = v
    if (v > max) max = v
  }
  return [min, max]
}

/** Unit edge normals of both polygons: the candidate separating axes. */
function edgeNormals(a: readonly Vec2[], b: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!
      const q = poly[(i + 1) % poly.length]!
      const ex = q.x - p.x
      const ey = q.y - p.y
      const l = Math.hypot(ex, ey)
      if (l < 1e-9) continue
      out.push({ x: -ey / l, y: ex / l })
    }
  }
  return out
}

/** Separating-axis penetration depth of two convex polygons; 0 or less means apart or touching. */
export function convexPenetration(a: readonly Vec2[], b: readonly Vec2[]): number {
  let depth = Infinity
  for (const axis of edgeNormals(a, b)) {
    const [amin, amax] = project(a, axis)
    const [bmin, bmax] = project(b, axis)
    const overlap = Math.min(amax, bmax) - Math.max(amin, bmin)
    if (overlap <= 0) return overlap
    if (overlap < depth) depth = overlap
  }
  return depth === Infinity ? 0 : depth
}

export interface PushOut {
  /** Unit direction to move `a` in. */
  dir: Vec2
  /** Distance along `dir` that leaves `a` just touching `b`. */
  depth: number
}

/**
 * Every way to push convex `a` clear of convex `b` along one separating axis, shortest first.
 * Empty when the two are already apart or touching.
 */
export function pushOutCandidates(a: readonly Vec2[], b: readonly Vec2[]): PushOut[] {
  const out: PushOut[] = []
  for (const axis of edgeNormals(a, b)) {
    const [amin, amax] = project(a, axis)
    const [bmin, bmax] = project(b, axis)
    if (Math.min(amax, bmax) - Math.max(amin, bmin) <= 0) return []
    out.push({ dir: axis, depth: bmax - amin }, { dir: { x: -axis.x, y: -axis.y }, depth: amax - bmin })
  }
  return out.sort((p, q) => p.depth - q.depth)
}

/** True when two items share more than a centimetre of height (a lamp on a table does not). */
export function verticalOverlap(a: Pick<Item, 'elevation' | 'size'>, b: Pick<Item, 'elevation' | 'size'>): boolean {
  const top = Math.min(a.elevation + a.size.h, b.elevation + b.size.h)
  const bottom = Math.max(a.elevation, b.elevation)
  return top - bottom > 0.01
}

/** Items that take part in collisions: a real footprint and not flat. */
export function solidItem(item: Pick<Item, 'size' | 'catalogId'>): boolean {
  return item.size.w > 0 && item.size.d > 0 && !isFlatItem(item)
}

/** True when the wall stands high enough to meet an item based at `elevation`. */
export function wallReaches(wall: Pick<Wall, 'height'>, elevation: number): boolean {
  return elevation < wall.height - 1e-3
}

export interface WallPiece {
  wall: Wall
  a: Vec2
  b: Vec2
  halfWidth: number
  polygon: Vec2[]
}

/** Solid wall pieces (door gaps cut out) as plan rectangles. Railings and curved walls are skipped. */
export function wallPieces(level: Level): WallPiece[] {
  const out: WallPiece[] = []
  for (const wall of level.walls) {
    if (wall.kind === 'railing' || Math.abs(wall.bulge) > 1e-6) continue
    for (const seg of solidSegments(wall, level.openings)) {
      const dx = seg.b.x - seg.a.x
      const dy = seg.b.y - seg.a.y
      const l = Math.hypot(dx, dy)
      if (l < 1e-6) continue
      const n = { x: (-dy / l) * seg.halfWidth, y: (dx / l) * seg.halfWidth }
      out.push({
        wall,
        a: seg.a,
        b: seg.b,
        halfWidth: seg.halfWidth,
        polygon: [
          { x: seg.a.x + n.x, y: seg.a.y + n.y },
          { x: seg.b.x + n.x, y: seg.b.y + n.y },
          { x: seg.b.x - n.x, y: seg.b.y - n.y },
          { x: seg.a.x - n.x, y: seg.a.y - n.y },
        ],
      })
    }
  }
  return out
}

export interface OverlapReport {
  /** Item id pairs whose footprints and heights intersect. */
  pairs: [string, string][]
  /** Items cutting into a wall. */
  walls: { itemId: string; wallId: string }[]
}

/** Furniture that intersects other furniture or a wall. Flat items and stacked items are ignored. */
export function itemOverlaps(level: Level): OverlapReport {
  const items = level.items.filter(solidItem)
  const shapes = items.map(itemFootprint)
  const pairs: [string, string][] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!
      const b = items[j]!
      if (!verticalOverlap(a, b)) continue
      if (convexPenetration(shapes[i]!, shapes[j]!) > OVERLAP_EPS) pairs.push([a.id, b.id])
    }
  }
  const walls: { itemId: string; wallId: string }[] = []
  const pieces = wallPieces(level)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const seen = new Set<string>()
    for (const piece of pieces) {
      if (seen.has(piece.wall.id)) continue
      if (!wallReaches(piece.wall, item.elevation)) continue
      if (convexPenetration(shapes[i]!, piece.polygon) > OVERLAP_EPS) {
        seen.add(piece.wall.id)
        walls.push({ itemId: item.id, wallId: piece.wall.id })
      }
    }
  }
  return { pairs, walls }
}

/** Ids of every item in an overlap. */
export function overlappingIds(report: OverlapReport): Set<string> {
  const out = new Set<string>()
  for (const [a, b] of report.pairs) {
    out.add(a)
    out.add(b)
  }
  for (const hit of report.walls) out.add(hit.itemId)
  return out
}

export interface DoorSwing {
  openingId: string
  hinge: Vec2
  radius: number
  /** Convex quarter-circle: the hinge, then the arc from closed to open. */
  polygon: Vec2[]
}

function sector(hinge: Vec2, from: Vec2, to: Vec2, radius: number, steps = 8): Vec2[] {
  const a0 = Math.atan2(from.y, from.x)
  let sweep = Math.atan2(to.y, to.x) - a0
  while (sweep > Math.PI) sweep -= Math.PI * 2
  while (sweep < -Math.PI) sweep += Math.PI * 2
  const out: Vec2[] = [{ ...hinge }]
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (sweep * i) / steps
    out.push({ x: hinge.x + Math.cos(t) * radius, y: hinge.y + Math.sin(t) * radius })
  }
  return out
}

/** Swing areas of the hinged doors on the level, matching the plan drawing (one leaf, or two for a double door). */
export function doorSwings(level: Level): DoorSwing[] {
  const out: DoorSwing[] = []
  for (const opening of level.openings) {
    if (opening.type !== 'door' && opening.type !== 'double-door') continue
    const wall = level.walls.find((w) => w.id === opening.wallId)
    if (!wall || wall.kind === 'railing') continue
    out.push(...swingsOf(wall, opening))
  }
  return out
}

function swingsOf(wall: Wall, opening: Opening): DoorSwing[] {
  const span = openingInterval(wall, opening)
  const width = span.end - span.start
  if (width < 0.05) return []
  const a = pointAlongWall(wall, span.start)
  const b = pointAlongWall(wall, span.end)
  const dir = wallDirection(wall)
  const back = { x: -dir.x, y: -dir.y }
  const n = { x: -dir.y, y: dir.x }
  const side = opening.flipSide ? { x: -n.x, y: -n.y } : n
  const half = wall.thickness / 2
  const face = (p: Vec2): Vec2 => ({ x: p.x + side.x * half, y: p.y + side.y * half })
  const leaf = (hinge: Vec2, along: Vec2, radius: number): DoorSwing => ({
    openingId: opening.id,
    hinge,
    radius,
    polygon: sector(hinge, along, side, radius),
  })
  if (opening.type === 'double-door') return [leaf(face(a), dir, width / 2), leaf(face(b), back, width / 2)]
  return opening.flipHinge ? [leaf(face(b), back, width)] : [leaf(face(a), dir, width)]
}

export type ClearanceIssue =
  | { kind: 'door-swing'; itemId: string; openingId: string; area: Vec2[] }
  | { kind: 'walkway'; itemIds: string[]; wallId: string | null; gap: number; area: Vec2[] }

function wrapQuarter(angle: number): number {
  const q = Math.PI / 2
  let r = angle % q
  if (r < 0) r += q
  return Math.min(r, q - r)
}

function blocksFloor(item: Item): boolean {
  return solidItem(item) && item.elevation < WALKWAY_MAX_BASE
}

interface Box {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Extents of `item` in a frame with origin `origin` and axes `ux`, `uy` (parallel to the item's edges). */
function boxIn(item: Item, origin: Vec2, ux: Vec2, uy: Vec2): Box {
  const [minX, maxX] = project(itemFootprint(item), ux)
  const [minY, maxY] = project(itemFootprint(item), uy)
  const ox = origin.x * ux.x + origin.y * ux.y
  const oy = origin.x * uy.x + origin.y * uy.y
  return { minX: minX - ox, maxX: maxX - ox, minY: minY - oy, maxY: maxY - oy }
}

function toWorld(origin: Vec2, ux: Vec2, uy: Vec2, x: number, y: number): Vec2 {
  return { x: origin.x + ux.x * x + uy.x * y, y: origin.y + ux.y * x + uy.y * y }
}

function rectArea(origin: Vec2, ux: Vec2, uy: Vec2, x0: number, x1: number, y0: number, y1: number): Vec2[] {
  return [
    toWorld(origin, ux, uy, x0, y0),
    toWorld(origin, ux, uy, x1, y0),
    toWorld(origin, ux, uy, x1, y1),
    toWorld(origin, ux, uy, x0, y1),
  ]
}

function narrow(gap: number): boolean {
  return gap > WALKWAY_TOUCH && gap < WALKWAY_MIN
}

/**
 * Door swings blocked by furniture, and passages narrower than {@link WALKWAY_MIN}
 * between facing parallel edges (item to item, or item to wall face).
 */
export function clearanceIssues(level: Level): ClearanceIssue[] {
  const issues: ClearanceIssue[] = []
  const items = level.items.filter(blocksFloor)
  const swings = doorSwings(level)
  for (const item of items) {
    const shape = itemFootprint(item)
    for (const swing of swings) {
      const opening = level.openings.find((o) => o.id === swing.openingId)
      if (opening && item.elevation >= opening.height) continue
      if (convexPenetration(shape, swing.polygon) > 0.01) {
        issues.push({ kind: 'door-swing', itemId: item.id, openingId: swing.openingId, area: swing.polygon })
      }
    }
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!
      const b = items[j]!
      if (wrapQuarter(a.rotation - b.rotation) > PARALLEL_TOL) continue
      const ux = { x: Math.cos(a.rotation), y: Math.sin(a.rotation) }
      const uy = { x: -ux.y, y: ux.x }
      const origin = a.position
      const A = boxIn(a, origin, ux, uy)
      const B = boxIn(b, origin, ux, uy)
      const overlapY = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY)
      const overlapX = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX)
      const gapX = Math.max(B.minX - A.maxX, A.minX - B.maxX)
      const gapY = Math.max(B.minY - A.maxY, A.minY - B.maxY)
      if (overlapY >= WALKWAY_OVERLAP && narrow(gapX)) {
        const x0 = B.minX - A.maxX > 0 ? A.maxX : B.maxX
        const y0 = Math.max(A.minY, B.minY)
        issues.push({
          kind: 'walkway',
          itemIds: [a.id, b.id],
          wallId: null,
          gap: gapX,
          area: rectArea(origin, ux, uy, x0, x0 + gapX, y0, y0 + overlapY),
        })
      } else if (overlapX >= WALKWAY_OVERLAP && narrow(gapY)) {
        const y0 = B.minY - A.maxY > 0 ? A.maxY : B.maxY
        const x0 = Math.max(A.minX, B.minX)
        issues.push({
          kind: 'walkway',
          itemIds: [a.id, b.id],
          wallId: null,
          gap: gapY,
          area: rectArea(origin, ux, uy, x0, x0 + overlapX, y0, y0 + gapY),
        })
      }
    }
  }

  const pieces = wallPieces(level)
  for (const item of items) {
    const byWall = new Map<string, { gap: number; area: Vec2[] }>()
    for (const piece of pieces) {
      const dx = piece.b.x - piece.a.x
      const dy = piece.b.y - piece.a.y
      const length = Math.hypot(dx, dy)
      const ux = { x: dx / length, y: dy / length }
      if (wrapQuarter(item.rotation - Math.atan2(ux.y, ux.x)) > PARALLEL_TOL) continue
      const uy0 = { x: -ux.y, y: ux.x }
      const side = (item.position.x - piece.a.x) * uy0.x + (item.position.y - piece.a.y) * uy0.y
      const uy = side >= 0 ? uy0 : { x: -uy0.x, y: -uy0.y }
      const box = boxIn(item, piece.a, ux, uy)
      const overlap = Math.min(length, box.maxX) - Math.max(0, box.minX)
      if (overlap < WALKWAY_OVERLAP) continue
      const gap = box.minY - piece.halfWidth
      if (!narrow(gap)) continue
      const x0 = Math.max(0, box.minX)
      const area = rectArea(piece.a, ux, uy, x0, x0 + overlap, piece.halfWidth, box.minY)
      const prev = byWall.get(piece.wall.id)
      if (!prev || gap < prev.gap) byWall.set(piece.wall.id, { gap, area })
    }
    for (const [wallId, hit] of byWall) {
      issues.push({ kind: 'walkway', itemIds: [item.id], wallId, gap: hit.gap, area: hit.area })
    }
  }
  return issues
}

/** Issues that involve one of `ids`. */
export function issuesFor(issues: readonly ClearanceIssue[], ids: readonly string[]): ClearanceIssue[] {
  const set = new Set(ids)
  return issues.filter((issue) => (issue.kind === 'door-swing' ? set.has(issue.itemId) : issue.itemIds.some((id) => set.has(id))))
}
