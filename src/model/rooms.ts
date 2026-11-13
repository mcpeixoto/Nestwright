import {
  closestPointOnSegment,
  dist,
  lerp,
  polygonArea,
  polygonCentroid,
  pointInPolygon,
  segmentIntersection,
  sub,
  cross,
} from './geometry'
import type { Level, Room, RoomType, Vec2, Wall } from './types'
import { JOIN_EPS, locateOnWall, wallFrame } from './walls'

const ROOM_LABEL: Record<RoomType, string> = {
  living: 'Living',
  kitchen: 'Kitchen',
  dining: 'Dining',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  wc: 'WC',
  office: 'Office',
  hall: 'Hall',
  storage: 'Storage',
  laundry: 'Laundry',
  garage: 'Garage',
  balcony: 'Balcony',
  terrace: 'Terrace',
  kids: 'Kids',
  other: 'Room',
}

interface Seg {
  a: Vec2
  b: Vec2
  wallId: string
}

function centrelineSegments(wall: Wall): Seg[] {
  const frame = wallFrame(wall)
  const segs: Seg[] = []
  for (let i = 0; i < frame.points.length - 1; i++) {
    const a = frame.points[i]
    const b = frame.points[i + 1]
    if (!a || !b) continue
    if (dist(a, b) < 1e-6) continue
    segs.push({ a, b, wallId: wall.id })
  }
  return segs
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    if (out.length === 0 || v - (out[out.length - 1] ?? 0) > 1e-6) out.push(v)
  }
  return out
}

/** Split every centre-line where another wall crosses it or a T lands on it. */
function splitSegments(segs: Seg[]): Seg[] {
  const params = segs.map(() => [0, 1])
  const mark = (index: number, t: number, length: number) => {
    const distAlong = t * length
    if (distAlong > JOIN_EPS * 0.5 && length - distAlong > JOIN_EPS * 0.5) {
      params[index]?.push(t)
    }
  }
  for (let i = 0; i < segs.length; i++) {
    const si = segs[i]
    if (!si) continue
    const li = dist(si.a, si.b)
    for (let j = i + 1; j < segs.length; j++) {
      const sj = segs[j]
      if (!sj) continue
      const lj = dist(sj.a, sj.b)
      const hit = segmentIntersection(si.a, si.b, sj.a, sj.b)
      if (hit) {
        mark(i, hit.t, li)
        mark(j, hit.u, lj)
      }
      for (const p of [sj.a, sj.b]) {
        const c = closestPointOnSegment(p, si.a, si.b)
        if (dist(c.point, p) <= JOIN_EPS) mark(i, c.t, li)
      }
      for (const p of [si.a, si.b]) {
        const c = closestPointOnSegment(p, sj.a, sj.b)
        if (dist(c.point, p) <= JOIN_EPS) mark(j, c.t, lj)
      }
    }
  }
  const out: Seg[] = []
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    if (!seg) continue
    const ts = uniqueSorted(params[i] ?? [0, 1])
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k] ?? 0
      const t1 = ts[k + 1] ?? 1
      const a = lerp(seg.a, seg.b, t0)
      const b = lerp(seg.a, seg.b, t1)
      if (dist(a, b) < 1e-5) continue
      out.push({ a, b, wallId: seg.wallId })
    }
  }
  return out
}

interface Vertex {
  x: number
  y: number
}

class VertexSet {
  points: Vertex[] = []

  add(p: Vec2): number {
    for (let i = 0; i < this.points.length; i++) {
      const q = this.points[i]
      if (q && dist(q, p) <= JOIN_EPS) return i
    }
    this.points.push({ x: p.x, y: p.y })
    return this.points.length - 1
  }
}

interface DirEdge {
  id: number
  from: number
  to: number
  wallId: string
  angle: number
}

function simplifyCollinear(poly: Vec2[]): Vec2[] {
  if (poly.length <= 3) return poly
  const kept: Vec2[] = []
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length]
    const curr = poly[i]
    const next = poly[(i + 1) % poly.length]
    if (!prev || !curr || !next) continue
    const turn = cross(sub(curr, prev), sub(next, curr))
    if (Math.abs(turn) > 1e-8) kept.push(curr)
  }
  return kept.length >= 3 ? kept : poly
}

function computeRooms(level: Level): Room[] {
  const segs: Seg[] = []
  for (const wall of level.walls) {
    if (wall.kind === 'railing') continue
    segs.push(...centrelineSegments(wall))
  }
  const pieces = splitSegments(segs)
  const verts = new VertexSet()
  const raw: { from: number; to: number; wallId: string }[] = []
  for (const seg of pieces) {
    const from = verts.add(seg.a)
    const to = verts.add(seg.b)
    if (from === to) continue
    raw.push({ from, to, wallId: seg.wallId })
  }

  const adj = new Map<number, DirEdge[]>()
  const edges: DirEdge[] = []
  let nextId = 0
  const push = (from: number, to: number, wallId: string) => {
    const a = verts.points[from]
    const b = verts.points[to]
    if (!a || !b) return
    const edge: DirEdge = {
      id: nextId++,
      from,
      to,
      wallId,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    }
    edges.push(edge)
    const list = adj.get(from)
    if (list) list.push(edge)
    else adj.set(from, [edge])
  }
  for (const e of raw) {
    push(e.from, e.to, e.wallId)
    push(e.to, e.from, e.wallId)
  }
  for (const list of adj.values()) list.sort((a, b) => a.angle - b.angle)

  const visited = new Set<number>()
  const faces: { polygon: Vec2[]; wallIds: string[] }[] = []

  const nextEdge = (incoming: DirEdge): DirEdge | null => {
    const outs = adj.get(incoming.to)
    if (!outs || outs.length === 0) return null
    let back = outs.findIndex((e) => e.to === incoming.from)
    if (back < 0) {
      const vx = verts.points[incoming.from]
      const vy = verts.points[incoming.to]
      if (!vx || !vy) return outs[0] ?? null
      const backAngle = Math.atan2(vx.y - vy.y, vx.x - vy.x)
      let best = 0
      let bestDiff = Infinity
      for (let i = 0; i < outs.length; i++) {
        const edge = outs[i]
        if (!edge) continue
        let d = Math.abs(edge.angle - backAngle)
        if (d > Math.PI) d = Math.PI * 2 - d
        if (d < bestDiff) {
          bestDiff = d
          best = i
        }
      }
      back = best
    }
    const prev = (back - 1 + outs.length) % outs.length
    return outs[prev] ?? null
  }

  for (const start of edges) {
    if (visited.has(start.id)) continue
    const loop: DirEdge[] = []
    let cursor: DirEdge | null = start
    let guard = edges.length + 2
    let closed = false
    while (cursor && guard-- > 0) {
      if (visited.has(cursor.id)) break
      visited.add(cursor.id)
      loop.push(cursor)
      const n = nextEdge(cursor)
      if (!n) break
      if (n.id === start.id) {
        closed = true
        break
      }
      cursor = n
    }
    if (!closed || loop.length < 3) continue
    const polygon: Vec2[] = []
    const wallIds: string[] = []
    const seenWalls = new Set<string>()
    for (const edge of loop) {
      const p = verts.points[edge.from]
      if (p) polygon.push({ x: p.x, y: p.y })
      if (!seenWalls.has(edge.wallId)) {
        seenWalls.add(edge.wallId)
        wallIds.push(edge.wallId)
      }
    }
    const simple = simplifyCollinear(polygon)
    const area = polygonArea(simple)
    // Interior faces are walked counter-clockwise; the outer face is clockwise.
    if (area > 1e-4) faces.push({ polygon: simple, wallIds })
  }

  faces.sort((a, b) => a.wallIds.slice().sort().join(',').localeCompare(b.wallIds.slice().sort().join(',')))
  const counts: Partial<Record<RoomType, number>> = {}
  const rooms: Room[] = []
  for (const face of faces) {
    const key = face.wallIds.slice().sort().join(',')
    const props = level.rooms.find((r) => r.key === key)
    const type: RoomType = props?.type ?? 'living'
    counts[type] = (counts[type] ?? 0) + 1
    const index = counts[type] ?? 1
    rooms.push({
      key,
      name: props?.name ?? `${ROOM_LABEL[type]} ${index}`,
      type,
      floor: props?.floor ? { ...props.floor } : { id: 'oak-planks' },
      ceiling: props?.ceiling ? { ...props.ceiling } : { id: 'plaster-white' },
      noCeiling: props?.noCeiling,
      polygon: face.polygon,
      area: polygonArea(face.polygon),
      centroid: polygonCentroid(face.polygon),
    })
  }
  return rooms
}

/**
 * Closed centre-line loops become rooms. User fields in `level.rooms` are matched
 * by the sorted wall ids. Railings do not bound a room.
 * Not cached here: callers that keep a stable level object (the store selector,
 * the plan renderer) memoize on identity themselves. In-place drafts must recompute.
 */
export function detectRooms(level: Level): Room[] {
  return computeRooms(level)
}

export function roomKeyAt(level: Level, point: Vec2): string | null {
  const rooms = detectRooms(level)
  for (const room of rooms) {
    if (pointInPolygon(point, room.polygon)) return room.key
  }
  return null
}

export function roomAt(level: Level, point: Vec2): Room | null {
  const key = roomKeyAt(level, point)
  if (!key) return null
  return detectRooms(level).find((r) => r.key === key) ?? null
}

/** Distance from a point to the nearest wall centre-line, used by tools. */
export function nearestWallPoint(level: Level, point: Vec2): { wall: Wall; point: Vec2; distance: number } | null {
  let best: { wall: Wall; point: Vec2; distance: number } | null = null
  for (const wall of level.walls) {
    const loc = locateOnWall(wall, point)
    if (!best || loc.distanceToWall < best.distance) {
      best = { wall, point: loc.point, distance: loc.distanceToWall }
    }
  }
  return best
}
