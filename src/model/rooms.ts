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
import { intersectionArea } from './polygon'
import type { Level, Project, Room, RoomProps, RoomType, Vec2, Wall } from './types'
import { JOIN_EPS, locateOnWall, wallFrame } from './walls'

/** English default-name stems. New rooms are named `<stem> <n>`; the UI translates names still in that form. */
export const ROOM_LABEL: Record<RoomType, string> = {
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
  // Collinear overlaps were cut at each other's ends above; drop the doubled pieces so the
  // face walk sees each edge once. The first copy (and its wallId) wins.
  const unique: Seg[] = []
  for (const seg of out) {
    const twin = unique.some(
      (u) =>
        (dist(u.a, seg.a) <= JOIN_EPS && dist(u.b, seg.b) <= JOIN_EPS) ||
        (dist(u.a, seg.b) <= JOIN_EPS && dist(u.b, seg.a) <= JOIN_EPS),
    )
    if (!twin) unique.push(seg)
  }
  return unique
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

interface Face {
  key: string
  polygon: Vec2[]
}

/** Closed loops and their keys. Geometry only: records are not read. */
function detectFaces(level: Level): Face[] {
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

  return faces
    .map((face) => ({ key: face.wallIds.slice().sort().join(','), polygon: face.polygon }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

function resolveRooms(level: Level, faces: readonly Face[]): Room[] {
  const used = new Set<string>()
  const rooms: Room[] = []
  for (const face of faces) {
    const key = face.key
    const props = level.rooms.find((r) => r.key === key)
    const type: RoomType = props?.type ?? 'living'
    const stored = props?.name?.trim() ?? ''
    const name = stored && !used.has(stored) ? stored : nextRoomName(type, used)
    used.add(name)
    rooms.push({
      key,
      name,
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

function computeRooms(level: Level): Room[] {
  return resolveRooms(level, detectFaces(level))
}

function nextRoomName(type: RoomType, used: Set<string>): string {
  const label = ROOM_LABEL[type]
  let index = 1
  let name = `${label} ${index}`
  while (used.has(name)) {
    index += 1
    name = `${label} ${index}`
  }
  return name
}

/**
 * Share of the smaller of the two rooms that must overlap before a new room inherits an
 * old room's record. Half means a room that was split, merged or reshaped keeps its
 * details, while a sliver that merely touches an old room does not.
 */
export const ROOM_MATCH_SHARE = 0.5

function copyProps(props: RoomProps, key: string): RoomProps {
  return {
    key,
    name: props.name,
    type: props.type,
    floor: { ...props.floor },
    ceiling: { ...props.ceiling },
    ...(props.noCeiling ? { noCeiling: true } : {}),
  }
}

interface Candidate {
  next: Face
  old: Room
  overlap: number
}

/**
 * Carry room records across an edit that changed which walls bound a room (a wall
 * split, a dividing wall drawn or deleted, walls merged). A detected room with a
 * record under its own key keeps it. Every other room takes the record of the vanished
 * room it overlaps most, provided the overlap is at least ROOM_MATCH_SHARE of the
 * smaller of the two. Each old record goes to one room only, the one it overlaps most;
 * another room cut from the same old room copies its type and materials under a fresh
 * name. Returns old key → new key for every vanished room that landed somewhere, so
 * wishes and requirements can follow.
 */
function reconcileFaces(prev: Level, level: Level, faces: readonly Face[]): Map<string, string> {
  const rekey = new Map<string, string>()
  const recorded = new Set(level.rooms.map((room) => room.key))
  const orphans = faces.filter((face) => !recorded.has(face.key))
  // Cheap exit for the common edit: every room still has its record.
  if (orphans.length === 0) return rekey
  const nextKeys = new Set(faces.map((face) => face.key))
  const vanished = computeRooms(prev).filter((room) => !nextKeys.has(room.key))
  if (vanished.length === 0) return rekey

  const candidates: Candidate[] = []
  for (const next of orphans) {
    const nextArea = Math.abs(polygonArea(next.polygon))
    for (const old of vanished) {
      const overlap = intersectionArea(next.polygon, old.polygon)
      if (overlap <= 1e-6) continue
      if (overlap + 1e-9 < ROOM_MATCH_SHARE * Math.min(nextArea, Math.abs(old.area))) continue
      candidates.push({ next, old, overlap })
    }
  }
  if (candidates.length === 0) return rekey
  candidates.sort(
    (a, b) => b.overlap - a.overlap || a.next.key.localeCompare(b.next.key) || a.old.key.localeCompare(b.old.key),
  )

  const donorOf = (old: Room): RoomProps =>
    level.rooms.find((room) => room.key === old.key) ?? prev.rooms.find((room) => room.key === old.key) ?? old

  // Largest overlaps first: each new room and each old record pair up at most once.
  const heir = new Map<string, Room>()
  const given = new Set<string>()
  for (const { next, old } of candidates) {
    if (heir.has(next.key) || given.has(old.key)) continue
    heir.set(next.key, old)
    given.add(old.key)
    rekey.set(old.key, next.key)
    const live = level.rooms.find((room) => room.key === old.key)
    if (live) live.key = next.key
    else level.rooms.push(copyProps(donorOf(old), next.key))
  }

  const names = new Set(level.rooms.filter((room) => nextKeys.has(room.key)).map((room) => room.name))
  const cut = new Set<string>()
  for (const { next, old } of candidates) {
    if (!rekey.has(old.key)) rekey.set(old.key, next.key)
    if (heir.has(next.key) || cut.has(next.key)) continue
    cut.add(next.key)
    const donor = donorOf(old)
    const name = nextRoomName(donor.type, names)
    names.add(name)
    level.rooms.push({ ...copyProps(donor, next.key), name })
  }
  return rekey
}

/**
 * Write a stable name into `level.rooms` the first time a room appears. Given the
 * level as it was before the edit, records whose walls changed are carried over first
 * (see reconcileFaces). Returns old key → new key for the rooms that moved.
 */
export function ensureRoomRecords(level: Level, prev?: Level): Map<string, string> {
  const faces = detectFaces(level)
  const rekey = prev ? reconcileFaces(prev, level, faces) : new Map<string, string>()
  for (const room of resolveRooms(level, faces)) {
    const props = level.rooms.find((item) => item.key === room.key)
    if (!props) {
      level.rooms.push({
        key: room.key,
        name: room.name,
        type: room.type,
        floor: { ...room.floor },
        ceiling: { ...room.ceiling },
        ...(room.noCeiling ? { noCeiling: true } : {}),
      })
      continue
    }
    if (props.name !== room.name) props.name = room.name
  }
  return rekey
}

/** Point wishes and room requirements at the rooms their old keys turned into. */
export function rekeyRoomReferences(project: Project, rekey: ReadonlyMap<string, string>): void {
  if (rekey.size === 0) return
  for (const wish of project.wishes ?? []) {
    const target = wish.target
    if (target?.kind !== 'room') continue
    const next = rekey.get(target.key)
    if (next) target.key = next
  }
  for (const requirement of project.requirements ?? []) {
    const next = rekey.get(requirement.roomKey)
    if (next) requirement.roomKey = next
  }
}

/**
 * Run after every edit, inside the same draft so the patches carry it. `prev` is the
 * project before the edit. Returns old key → new key across all levels.
 */
export function reconcileProjectRooms(prev: Project | undefined, project: Project): Map<string, string> {
  const rekey = new Map<string, string>()
  const before = new Map((prev?.levels ?? []).map((level) => [level.id, level]))
  for (const level of project.levels) {
    const moved = ensureRoomRecords(level, before.get(level.id))
    for (const [from, to] of moved) rekey.set(from, to)
  }
  rekeyRoomReferences(project, rekey)
  return rekey
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
