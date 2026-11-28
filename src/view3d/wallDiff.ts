import { JOIN_EPS } from '../model/walls'
import type { Opening, Vec2, Wall } from '../model/types'

/** Which walls of a level need new meshes after an edit. Pure: no three. */
export interface WallDiff {
  rebuild: string[]
  remove: string[]
  floors: boolean
}

function sameGeometry(a: Wall, b: Wall): boolean {
  return (
    a.a.x === b.a.x &&
    a.a.y === b.a.y &&
    a.b.x === b.b.x &&
    a.b.y === b.b.y &&
    a.bulge === b.bulge &&
    a.thickness === b.thickness &&
    a.kind === b.kind
  )
}

function near(p: Vec2, q: Vec2): boolean {
  return Math.abs(p.x - q.x) <= JOIN_EPS && Math.abs(p.y - q.y) <= JOIN_EPS
}

function openingsByWall(openings: readonly Opening[]): Map<string, Opening[]> {
  const out = new Map<string, Opening[]>()
  for (const opening of openings) {
    const list = out.get(opening.wallId)
    if (list) list.push(opening)
    else out.set(opening.wallId, [opening])
  }
  return out
}

function sameOpenings(a: Opening[] | undefined, b: Opening[] | undefined): boolean {
  if (!a || !b) return (a?.length ?? 0) === 0 && (b?.length ?? 0) === 0
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function diffWalls(
  prev: readonly Wall[] | undefined,
  next: readonly Wall[],
  prevOpenings: readonly Opening[] | undefined,
  nextOpenings: readonly Opening[],
): WallDiff {
  if (prev === undefined) {
    return { rebuild: [...new Set(next.map((wall) => wall.id))].sort(), remove: [], floors: true }
  }
  const prevById = new Map(prev.map((wall) => [wall.id, wall]))
  const nextIds = new Set(next.map((wall) => wall.id))
  const rebuild = new Set<string>()
  const remove: string[] = []
  /** Endpoints of walls whose geometry changed, old and new: walls joined there re-mitre. */
  const joints: Vec2[] = []
  let floors = false

  const openingsChanged = prevOpenings !== nextOpenings
  const prevOpen = openingsChanged ? openingsByWall(prevOpenings ?? []) : undefined
  const nextOpen = openingsChanged ? openingsByWall(nextOpenings) : undefined

  for (const wall of next) {
    const before = prevById.get(wall.id)
    if (!before) {
      rebuild.add(wall.id)
      joints.push(wall.a, wall.b)
      floors = true
      continue
    }
    if (before !== wall) {
      rebuild.add(wall.id)
      if (!sameGeometry(before, wall)) {
        joints.push(before.a, before.b, wall.a, wall.b)
        floors = true
      }
    }
    if (openingsChanged && !sameOpenings(prevOpen!.get(wall.id), nextOpen!.get(wall.id))) rebuild.add(wall.id)
  }
  for (const wall of prev) {
    if (nextIds.has(wall.id)) continue
    remove.push(wall.id)
    joints.push(wall.a, wall.b)
    floors = true
  }
  if (joints.length > 0) {
    for (const wall of next) {
      if (rebuild.has(wall.id)) continue
      if (joints.some((p) => near(p, wall.a) || near(p, wall.b))) rebuild.add(wall.id)
    }
  }
  return { rebuild: [...rebuild].sort(), remove: [...new Set(remove)].sort(), floors }
}
