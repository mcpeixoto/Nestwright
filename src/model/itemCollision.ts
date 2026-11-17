import {
  convexPenetration,
  itemFootprint,
  OVERLAP_EPS,
  pushOutCandidates,
  solidItem,
  verticalOverlap,
  wallPieces,
  wallReaches,
} from './clearance'
import type { Item, Level, Vec2 } from './types'

/** Push rounds before giving up; corners and tight gaps settle in two or three. */
export const RESOLVE_PASSES = 6

export interface ResolvePose {
  position: Vec2
  rotation: number
  size: Item['size']
  /** Base height above the floor; 0 when left out. */
  elevation?: number
  /** Lets the flat-item rule (rugs) apply to the moving item too. */
  catalogId?: string
}

export interface ResolveOptions {
  /** Items that never block, usually the ones being dragged. */
  ignore?: readonly string[]
}

export interface ResolveResult {
  position: Vec2
  /** Always the input rotation. */
  rotation: number
  /** The position differs from the input. */
  moved: boolean
  /** No clear spot was found nearby; position is the input, unchanged. */
  blocked: boolean
}

/**
 * Push an item's pose out of every wall and every other solid item it cuts into, by the
 * shortest separating-axis move. Walls go first and an escape from furniture never ends in
 * a wall. Same solid, flat and stacked rules as `itemOverlaps`.
 */
export function resolveItemPose(level: Level, pose: ResolvePose, opts: ResolveOptions = {}): ResolveResult {
  const unchanged = (blocked: boolean): ResolveResult => ({
    position: { ...pose.position },
    rotation: pose.rotation,
    moved: false,
    blocked,
  })
  const self = { size: pose.size, catalogId: pose.catalogId ?? '', elevation: pose.elevation ?? 0 }
  if (!solidItem(self)) return unchanged(false)

  const ignore = new Set(opts.ignore ?? [])
  const walls = wallPieces(level)
    .filter((piece) => wallReaches(piece.wall, self.elevation))
    .map((piece) => piece.polygon)
  const items = level.items
    .filter((other) => !ignore.has(other.id) && solidItem(other) && verticalOverlap(self, other))
    .map(itemFootprint)

  const shapeAt = (position: Vec2) => itemFootprint({ position, rotation: pose.rotation, size: pose.size })
  const cuts = (shape: Vec2[], obstacle: readonly Vec2[]) => convexPenetration(shape, obstacle) > OVERLAP_EPS
  const cutsAny = (shape: Vec2[], obstacles: readonly (readonly Vec2[])[]) => obstacles.some((o) => cuts(shape, o))

  let position = { ...pose.position }
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    let moved = false
    for (const wall of walls) {
      const shape = shapeAt(position)
      if (!cuts(shape, wall)) continue
      const push = pushOutCandidates(shape, wall)[0]
      if (!push) continue
      position = { x: position.x + push.dir.x * push.depth, y: position.y + push.dir.y * push.depth }
      moved = true
    }
    for (const other of items) {
      const shape = shapeAt(position)
      if (!cuts(shape, other)) continue
      for (const push of pushOutCandidates(shape, other)) {
        const next = { x: position.x + push.dir.x * push.depth, y: position.y + push.dir.y * push.depth }
        if (cutsAny(shapeAt(next), walls)) continue
        position = next
        moved = true
        break
      }
    }
    if (!moved) break
  }

  const final = shapeAt(position)
  if (cutsAny(final, walls) || cutsAny(final, items)) return unchanged(true)
  const moved = Math.hypot(position.x - pose.position.x, position.y - pose.position.y) > 1e-9
  return moved ? { position, rotation: pose.rotation, moved, blocked: false } : unchanged(false)
}
