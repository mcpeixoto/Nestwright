import type { Item, Level, Vec2 } from './types'

/** An item's back edge closer than this to a wall face goes flush against it. */
export const WALL_SNAP_DISTANCE = 0.15
/** Rotation must be within this of "back to the wall" for the wall snap. */
export const WALL_SNAP_ANGLE = (20 * Math.PI) / 180
/** Edges of neighbouring items closer than this line up. */
export const ITEM_SNAP_DISTANCE = 0.08
/** Neighbours further apart than this across the other axis do not align. */
const ITEM_NEAR = 0.3
/** Rotations closer than this (mod 90°) count as parallel. */
const PARALLEL = (2 * Math.PI) / 180

export interface SnapGuide {
  a: Vec2
  b: Vec2
  kind: 'wall' | 'item'
}

export interface SnapPose {
  position: Vec2
  rotation: number
  size: Item['size']
}

export interface SnapOptions {
  /** false (Alt held) leaves the pose alone. */
  snap?: boolean
  /** Items that never act as neighbours, usually the ones being dragged. */
  ignore?: readonly string[]
  /** false keeps the rotation (group drags); the wall snap then needs an already-square item. */
  rotate?: boolean
}

export interface SnapResult {
  position: Vec2
  rotation: number
  guides: SnapGuide[]
  wallId: string | null
  neighbourId: string | null
}

function wrapPi(angle: number): number {
  let a = angle % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a <= -Math.PI) a += Math.PI * 2
  return a
}

function wrapQuarter(angle: number): number {
  const q = Math.PI / 2
  let r = angle % q
  if (r < 0) r += q
  return Math.min(r, q - r)
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

/** Half the item's extent along unit `axis`. */
function halfExtent(size: SnapPose['size'], rotation: number, axis: Vec2): number {
  const ux = { x: Math.cos(rotation), y: Math.sin(rotation) }
  const uy = { x: -ux.y, y: ux.x }
  return (size.w / 2) * Math.abs(dot(ux, axis)) + (size.d / 2) * Math.abs(dot(uy, axis))
}

interface StraightWall {
  id: string
  a: Vec2
  dir: Vec2
  length: number
  face: number
}

function straightWalls(level: Level): StraightWall[] {
  const out: StraightWall[] = []
  for (const wall of level.walls) {
    if (wall.kind === 'railing' || Math.abs(wall.bulge) > 1e-6) continue
    const dx = wall.b.x - wall.a.x
    const dy = wall.b.y - wall.a.y
    const length = Math.hypot(dx, dy)
    if (length < 0.05) continue
    out.push({ id: wall.id, a: wall.a, dir: { x: dx / length, y: dy / length }, length, face: wall.thickness / 2 })
  }
  return out
}

/**
 * Snap a dragged item: back edge flush to a wall face (and turned to face away from it),
 * a side flush to a perpendicular wall in a corner, then edges aligned with neighbours.
 */
export function snapItemPose(level: Level, pose: SnapPose, opts: SnapOptions = {}): SnapResult {
  const result: SnapResult = {
    position: { ...pose.position },
    rotation: pose.rotation,
    guides: [],
    wallId: null,
    neighbourId: null,
  }
  if (opts.snap === false) return result
  const rotate = opts.rotate !== false
  const walls = straightWalls(level)

  // Back to the wall.
  let best: { wall: StraightWall; n: Vec2; gap: number; rotation: number; along: number } | null = null
  for (const wall of walls) {
    const rel = { x: result.position.x - wall.a.x, y: result.position.y - wall.a.y }
    const along = dot(rel, wall.dir)
    if (along < 0 || along > wall.length) continue
    const n0 = { x: -wall.dir.y, y: wall.dir.x }
    const side = dot(rel, n0)
    const n = side >= 0 ? n0 : { x: -n0.x, y: -n0.y }
    const target = Math.atan2(-n.x, n.y)
    const off = Math.abs(wrapPi(pose.rotation - target))
    if (off > (rotate ? WALL_SNAP_ANGLE : PARALLEL)) continue
    const rotation = rotate ? target : pose.rotation
    const gap = Math.abs(side) - wall.face - halfExtent(pose.size, rotation, n)
    if (Math.abs(gap) > WALL_SNAP_DISTANCE) continue
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { wall, n, gap, rotation, along }
  }
  let lockedAxis: Vec2 | null = null
  if (best) {
    result.rotation = best.rotation
    result.position = { x: result.position.x - best.n.x * best.gap, y: result.position.y - best.n.y * best.gap }
    result.wallId = best.wall.id
    lockedAxis = best.n
    const reach = halfExtent(pose.size, result.rotation, best.wall.dir) + 0.25
    const base = {
      x: best.wall.a.x + best.wall.dir.x * best.along + best.n.x * best.wall.face,
      y: best.wall.a.y + best.wall.dir.y * best.along + best.n.y * best.wall.face,
    }
    result.guides.push({
      kind: 'wall',
      a: { x: base.x - best.wall.dir.x * reach, y: base.y - best.wall.dir.y * reach },
      b: { x: base.x + best.wall.dir.x * reach, y: base.y + best.wall.dir.y * reach },
    })

    // Into the corner: a side against a perpendicular wall.
    let corner: { wall: StraightWall; n: Vec2; gap: number } | null = null
    for (const wall of walls) {
      if (wall.id === best.wall.id || Math.abs(dot(wall.dir, best.wall.dir)) > 0.05) continue
      const rel = { x: result.position.x - wall.a.x, y: result.position.y - wall.a.y }
      const along = dot(rel, wall.dir)
      const across = halfExtent(pose.size, result.rotation, wall.dir)
      if (along < -across || along > wall.length + across) continue
      const n0 = { x: -wall.dir.y, y: wall.dir.x }
      const side = dot(rel, n0)
      const n = side >= 0 ? n0 : { x: -n0.x, y: -n0.y }
      const gap = Math.abs(side) - wall.face - halfExtent(pose.size, result.rotation, n)
      if (Math.abs(gap) > WALL_SNAP_DISTANCE) continue
      if (!corner || Math.abs(gap) < Math.abs(corner.gap)) corner = { wall, n, gap }
    }
    if (corner) {
      result.position = { x: result.position.x - corner.n.x * corner.gap, y: result.position.y - corner.n.y * corner.gap }
      return result
    }
  }

  // Edges of neighbours.
  const ignore = new Set(opts.ignore ?? [])
  type Cand = { offset: number; axis: Vec2; neighbour: Item; guide: SnapGuide }
  const cands: Cand[] = []
  for (const other of level.items) {
    if (ignore.has(other.id) || !(other.size.w > 0 && other.size.d > 0)) continue
    if (wrapQuarter(result.rotation - other.rotation) > PARALLEL) continue
    const ux = { x: Math.cos(other.rotation), y: Math.sin(other.rotation) }
    const uy = { x: -ux.y, y: ux.x }
    const rel = { x: result.position.x - other.position.x, y: result.position.y - other.position.y }
    const ax = dot(rel, ux)
    const ay = dot(rel, uy)
    const aw = halfExtent(pose.size, result.rotation, ux)
    const ad = halfExtent(pose.size, result.rotation, uy)
    const bw = other.size.w / 2
    const bd = other.size.d / 2
    const toWorld = (x: number, y: number): Vec2 => ({
      x: other.position.x + ux.x * x + uy.x * y,
      y: other.position.y + ux.y * x + uy.y * y,
    })
    for (const [axis, c, h, bh, cross, ch, bch] of [
      [ux, ax, aw, bw, ay, ad, bd],
      [uy, ay, ad, bd, ax, aw, bw],
    ] as const) {
      const crossOverlap = Math.min(cross + ch, bch) - Math.max(cross - ch, -bch)
      const options = [
        { offset: -bh - (c + h), edge: -bh, flush: true },
        { offset: bh - (c - h), edge: bh, flush: true },
        { offset: -bh - (c - h), edge: -bh, flush: false },
        { offset: bh - (c + h), edge: bh, flush: false },
      ]
      for (const option of options) {
        if (Math.abs(option.offset) > ITEM_SNAP_DISTANCE) continue
        if (option.flush ? crossOverlap <= 0.01 : crossOverlap < -ITEM_NEAR) continue
        const lo = Math.min(cross - ch, -bch) - 0.1
        const hi = Math.max(cross + ch, bch) + 0.1
        const onX = axis === ux
        const guide: SnapGuide = {
          kind: 'item',
          a: onX ? toWorld(option.edge, lo) : toWorld(lo, option.edge),
          b: onX ? toWorld(option.edge, hi) : toWorld(hi, option.edge),
        }
        cands.push({ offset: option.offset, axis, neighbour: other, guide })
      }
    }
  }
  const usable = cands
    .filter((cand) => !lockedAxis || Math.abs(dot(cand.axis, lockedAxis)) < 0.1)
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
  const first = usable[0]
  if (!first) return result
  const second = usable.find((cand) => Math.abs(dot(cand.axis, first.axis)) < 0.1)
  for (const cand of second ? [first, second] : [first]) {
    result.position = {
      x: result.position.x + cand.axis.x * cand.offset,
      y: result.position.y + cand.axis.y * cand.offset,
    }
    result.guides.push(cand.guide)
  }
  result.neighbourId = first.neighbour.id
  return result
}
