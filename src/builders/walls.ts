import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { add, dist, dot, len, lerp, normalize, perp, pointInPolygon, scale, sub } from '../model/geometry'
import { cutsSkirting, levelRooms, openingTrim, resolveTrim, roomBeside, SKIRTING, type ResolvedTrim } from '../model/trim'
import type { Level, MaterialRef, Room, Vec2, Wall } from '../model/types'
import { JOIN_EPS, openingInterval, sampleFrame, wallFrame, wallLength, mitrePoint, type WallFrame } from '../model/walls'
import { buildRailing } from './railings'
import { edgeStrip, Sheet, sweep, type PathFrame, type ProfilePoint } from './trim'

/** Painted trim (skirting, cove) and the dark strip of a shadow gap. */
export const TRIM_PAINT: MaterialRef = { id: 'render-stucco' }
// A real 10 mm gap reads near-black because it sits in its own shadow; the strip is painted so.
const SHADOW_GAP_PAINT: MaterialRef = { id: 'paint-charcoal', tint: '#4a4a4a' }
const SHADOW_GAP = 0.012
const COVE = 0.07
const UP = new THREE.Vector3(0, 1, 0)

export interface WallBuildContext {
  /** Rooms of the level; detected (and memoized) when absent. */
  rooms?: readonly Room[]
  trim?: ResolvedTrim
  /**
   * The storey directly above. It lays its floor slab under its own elevation, so under its rooms
   * the visible ceiling sits a slab lower than level.height.
   */
  above?: CeilingAbove
}

export interface CeilingAbove {
  rooms: readonly Room[]
  slab: number
}

/** Scratch geometry. Indices are chosen so the geometric normal matches the outward vector. */
class Bucket {
  readonly pos: number[] = []
  readonly norm: number[] = []
  readonly uv: number[] = []
  readonly idx: number[] = []

  private get count(): number {
    return this.pos.length / 3
  }

  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) {
    this.pos.push(x, y, z)
    this.norm.push(nx, ny, nz)
    this.uv.push(u, v)
  }

  /** Vertical quad. `a`/`b` are plan points; outward is a plan vector. */
  side(a: Vec2, b: Vec2, y0: number, y1: number, elevation: number, u0: number, u1: number, outward: Vec2) {
    if (y1 - y0 < 1e-4 || dist(a, b) < 1e-5) return
    const nx = outward.x
    const nz = outward.y
    const i = this.count
    const yb = elevation + y0
    const yt = elevation + y1
    this.vert(a.x, yb, a.y, nx, 0, nz, u0, y0)
    this.vert(b.x, yb, b.y, nx, 0, nz, u1, y0)
    this.vert(b.x, yt, b.y, nx, 0, nz, u1, y1)
    this.vert(a.x, yt, a.y, nx, 0, nz, u0, y1)
    // Left of a→b in the x/z plane. Flip the winding when that isn't the outward direction.
    const dx = b.x - a.x
    const dz = b.y - a.y
    const agree = -dz * nx + dx * nz
    if (agree >= 0) this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
    else this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2)
  }

  cap(poly: readonly Vec2[], y: number, elevation: number, up: number) {
    if (poly.length < 3) return
    const Y = elevation + y
    const base = this.count
    for (const p of poly) this.vert(p.x, Y, p.y, 0, up, 0, p.x, p.y)
    for (let k = 1; k < poly.length - 1; k++) {
      if (up >= 0) this.idx.push(base, base + k, base + k + 1)
      else this.idx.push(base, base + k + 1, base + k)
    }
  }

  /** Appends a trim sheet drawn with this face's material (edge bevels). */
  absorb(sheet: Sheet) {
    const base = this.count
    this.pos.push(...sheet.pos)
    this.norm.push(...sheet.norm)
    this.uv.push(...sheet.uv)
    for (const i of sheet.idx) this.idx.push(base + i)
  }

  geometry(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    geo.setIndex(this.idx)
    return geo
  }
}

interface Span {
  t0: number
  t1: number
  y0: number
  y1: number
  capStart: boolean
  capEnd: boolean
}

function spansFor(wall: Wall, level: Level): Span[] {
  const length = wallLength(wall)
  const height = wall.height
  if (length < 1e-4 || height < 1e-4) return []
  const cuts = level.openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => {
      const iv = openingInterval(wall, o)
      return { start: iv.start, end: iv.end, sill: Math.max(0, o.sill), top: Math.min(height, o.sill + o.height) }
    })
    .filter((o) => o.end - o.start > 1e-3 && o.top - o.sill > 1e-3)
    .sort((a, b) => a.start - b.start)

  const spans: Span[] = []
  let cursor = 0
  const full = (t0: number, t1: number) => {
    if (t1 - t0 < 1e-3) return
    spans.push({
      t0,
      t1,
      y0: 0,
      y1: height,
      capStart: t0 <= 1e-3,
      capEnd: t1 >= length - 1e-3,
    })
  }
  for (const cut of cuts) {
    full(cursor, cut.start)
    if (cut.sill > 1e-3) {
      spans.push({ t0: cut.start, t1: cut.end, y0: 0, y1: cut.sill, capStart: false, capEnd: false })
    }
    if (height - cut.top > 1e-3) {
      spans.push({ t0: cut.start, t1: cut.end, y0: cut.top, y1: height, capStart: false, capEnd: false })
    }
    cursor = Math.max(cursor, cut.end)
  }
  full(cursor, length)
  return spans
}

function samples(frame: WallFrame, t0: number, t1: number): number[] {
  const out = [t0]
  for (const c of frame.cum) {
    if (c > t0 + 1e-4 && c < t1 - 1e-4) out.push(c)
  }
  out.push(t1)
  return out
}

function corner(wall: Wall, frame: WallFrame, distance: number, side: 1 | -1, cap: 'start' | 'end' | 'none', neighbours: readonly Wall[]): Vec2 {
  if (cap === 'start') return mitrePoint(wall, 'a', side, neighbours)
  if (cap === 'end') return mitrePoint(wall, 'b', side, neighbours)
  const s = sampleFrame(frame, distance)
  return add(s.point, scale(s.normal, side * wall.thickness * 0.5))
}

function outwardOf(a: Vec2, b: Vec2, awayFrom: Vec2): Vec2 {
  const n = perp(normalize(sub(b, a)))
  const mid = lerp(a, b, 0.5)
  return dot(n, sub(mid, awayFrom)) >= 0 ? n : scale(n, -1)
}

function tag(mesh: THREE.Mesh, id: string) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.entityId = id
  mesh.userData.kind = 'wall'
}

/**
 * Wall solid with real openings: full-height spans, a piece under the sill and
 * a piece over the lintel. Curved walls are a run of straight segments.
 * Left, right and top/end faces are separate materials; ends use the left one.
 */
export function buildWall(wall: Wall, level: Level, neighbours: readonly Wall[], ctx: WallBuildContext = {}): THREE.Group {
  if (wall.kind === 'railing') return buildRailing(wall, level)
  const group = new THREE.Group()
  group.userData.entityId = wall.id
  group.userData.kind = 'wall'
  const frame = wallFrame(wall)
  const spans = spansFor(wall, level)
  const left = new Bucket()
  const right = new Bucket()
  const ends = new Bucket()
  const others = neighbours.filter((n) => n.id !== wall.id)

  for (const span of spans) {
    const ds = samples(frame, span.t0, span.t1)
    for (let i = 0; i < ds.length - 1; i++) {
      const d0 = ds[i] ?? span.t0
      const d1 = ds[i + 1] ?? span.t1
      const cap0 = span.capStart && i === 0
      const cap1 = span.capEnd && i === ds.length - 2
      const p0 = corner(wall, frame, d0, 1, cap0 ? 'start' : 'none', others)
      const p1 = corner(wall, frame, d1, 1, cap1 ? 'end' : 'none', others)
      const p2 = corner(wall, frame, d1, -1, cap1 ? 'end' : 'none', others)
      const p3 = corner(wall, frame, d0, -1, cap0 ? 'start' : 'none', others)
      const mid = sampleFrame(frame, (d0 + d1) / 2)
      const center = mid.point
      left.side(p0, p1, span.y0, span.y1, level.elevation, d0, d1, mid.normal)
      right.side(p3, p2, span.y0, span.y1, level.elevation, d0, d1, scale(mid.normal, -1))
      ends.side(p1, p2, span.y0, span.y1, level.elevation, 0, dist(p1, p2), outwardOf(p1, p2, center))
      ends.side(p3, p0, span.y0, span.y1, level.elevation, 0, dist(p3, p0), outwardOf(p3, p0, center))
      const quad = [p0, p1, p2, p3]
      ends.cap(quad, span.y1, level.elevation, 1)
      ends.cap(quad, span.y0, level.elevation, -1)
    }
  }

  const rooms = ctx.rooms ?? levelRooms(level)
  const bevels = edgeBevels(wall, level, frame, others, rooms)
  left.absorb(bevels.left)
  right.absorb(bevels.right)

  const addPart = (bucket: Bucket, ref: Wall['left'], face: 'left' | 'right' | 'end') => {
    const geo = bucket.geometry()
    if (!geo) return
    const mesh = new THREE.Mesh(geo, getMaterial(ref))
    tag(mesh, wall.id)
    mesh.userData.face = face
    group.add(mesh)
  }
  addPart(left, wall.left, 'left')
  addPart(right, wall.right, 'right')
  addPart(ends, wall.left, 'end')

  const trim = interiorTrim(wall, level, frame, others, rooms, ctx.trim ?? resolveTrim(level.trim), ctx.above)
  for (const [sheet, ref, name] of [
    [trim.paint, TRIM_PAINT, 'skirting'],
    [trim.gap, SHADOW_GAP_PAINT, 'shadow-gap'],
  ] as const) {
    const mesh = sheet.mesh(getMaterial(ref))
    if (!mesh) continue
    tag(mesh, wall.id)
    mesh.userData.trim = name
    group.add(mesh)
  }
  return group
}

// ---------------------------------------------------------------- trim

/** Normal of the face line at `distance`, mitred where a curved wall's segments meet. */
function pointNormal(frame: WallFrame, distance: number): Vec2 {
  for (let i = 1; i < frame.cum.length - 1; i++) {
    if (Math.abs((frame.cum[i] ?? 0) - distance) < 1e-4) {
      const n0 = perp(frame.tangents[i - 1] ?? { x: 1, y: 0 })
      const n1 = perp(frame.tangents[i] ?? { x: 1, y: 0 })
      const sum = add(n0, n1)
      const k = 1 + dot(n0, n1)
      return k > 1e-3 ? scale(sum, 1 / k) : n0
    }
  }
  return sampleFrame(frame, distance).normal
}

function grown(wall: Wall, by: number): Wall {
  return { ...wall, thickness: wall.thickness + 2 * by }
}

/**
 * The face line of one side between two distances, as sweep frames: position on the face at
 * the floor and the direction a profile stands out along. At a wall joint that direction is
 * the mitre with the neighbour, so trim on two walls meets in a clean corner.
 */
function facePath(wall: Wall, frame: WallFrame, others: readonly Wall[], side: 1 | -1, t0: number, t1: number, y: number): PathFrame[] {
  const length = frame.length
  const ds = samples(frame, t0, t1)
  const grow = 0.01
  const bigger = others.map((n) => grown(n, grow))
  return ds.map((d, i) => {
    const cap = i === 0 && d <= 1e-3 ? 'start' : i === ds.length - 1 && d >= length - 1e-3 ? 'end' : 'none'
    const p = corner(wall, frame, d, side, cap, others)
    let o = scale(pointNormal(frame, d), side)
    if (cap !== 'none') {
      const q = corner(grown(wall, grow), frame, d, side, cap, bigger)
      const m = scale(sub(q, p), 1 / grow)
      if (len(m) > 0.5 && len(m) < 4) o = m
    }
    return { p: new THREE.Vector3(p.x, y, p.y), s: UP, o: new THREE.Vector3(o.x, 0, o.y) }
  })
}

/** [0, length] minus the given intervals. */
function gaps(length: number, cuts: readonly [number, number][]): [number, number][] {
  const sorted = [...cuts].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let cursor = 0
  for (const [s, e] of sorted) {
    if (s - cursor > 0.02) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (length - cursor > 0.02) out.push([cursor, length])
  return out
}

/**
 * Skirting along the floor and a shadow gap (or cove) at the ceiling line of every face that
 * looks into a room. Doors and floor-length glazing break the skirting; openings that reach
 * the ceiling break the top trim.
 */
function interiorTrim(
  wall: Wall,
  level: Level,
  frame: WallFrame,
  others: readonly Wall[],
  rooms: readonly Room[],
  trim: ResolvedTrim,
  above: CeilingAbove | undefined,
): { paint: Sheet; gap: Sheet } {
  const paint = new Sheet()
  const gap = new Sheet()
  const length = frame.length
  if (length < 0.05 || wall.kind === 'railing') return { paint, gap }
  const own = level.openings.filter((o) => o.wallId === wall.id)
  const skirtCuts: [number, number][] = []
  for (const opening of own) {
    const iv = openingInterval(wall, opening)
    if (cutsSkirting(opening)) skirtCuts.push([iv.start, iv.end])
  }
  // Where a room of the storey above sits overhead, its floor slab is the visible ceiling.
  const ceilingAt = (side: 1 | -1, t: number): number => {
    if (!above) return level.height
    const at = sampleFrame(frame, t)
    const probe = add(at.point, scale(at.normal, side * (wall.thickness / 2 + 0.05)))
    return above.rooms.some((room) => pointInPolygon(probe, room.polygon)) ? level.height - above.slab : level.height
  }
  const H = SKIRTING.height
  const y = level.elevation
  const D = SKIRTING.depth
  const bevel = 0.004
  const skirting: ProfilePoint[] = [
    [0, 0],
    [H, 0],
    [H, D - bevel],
    [H - bevel, D],
    [0, D],
  ]
  const ceilingProfile = (top: number): ProfilePoint[] => {
    const out: ProfilePoint[] = []
    if (trim.ceiling === 'shadow-gap') {
      out.push([top, 0.0006], [top - SHADOW_GAP, 0.0006])
    } else if (trim.ceiling === 'cove') {
      for (let k = 0; k <= 6; k++) {
        const phi = -(k / 6) * (Math.PI / 2)
        out.push([top - COVE + COVE * Math.cos(phi), COVE + COVE * Math.sin(phi)])
      }
    }
    return out
  }
  const half = wall.kind === 'half'
  for (const side of [1, -1] as const) {
    if (trim.skirting && wall.height > H * 2) {
      for (const [t0, t1] of gaps(length, skirtCuts)) {
        if (!roomBeside(wall, side, (t0 + t1) / 2, rooms)) continue
        const path = facePath(wall, frame, others, side, t0, t1, y)
        sweep(paint, path, skirting, { skip: [0], capStart: t0 > 1e-3, capEnd: t1 < length - 1e-3 })
      }
    }
    if (trim.ceiling === 'none' || half) continue
    const top = Math.min(wall.height, ceilingAt(side, length / 2))
    if (wall.height < top - 0.02) continue
    const topCuts: [number, number][] = []
    for (const opening of own) {
      const iv = openingInterval(wall, opening)
      if (opening.sill + opening.height > top - COVE - 0.005) topCuts.push([iv.start, iv.end])
    }
    for (const [t0, t1] of gaps(length, topCuts)) {
      const room = roomBeside(wall, side, (t0 + t1) / 2, rooms)
      if (!room || room.noCeiling) continue
      // Split where the ceiling height changes (the edge of the storey above).
      const runs: [number, number, number][] = []
      const steps = Math.max(1, Math.ceil((t1 - t0) / 0.1))
      for (let k = 0; k < steps; k++) {
        const a = t0 + ((t1 - t0) * k) / steps
        const b = t0 + ((t1 - t0) * (k + 1)) / steps
        const h = Math.min(wall.height, ceilingAt(side, (a + b) / 2))
        const last = runs[runs.length - 1]
        if (last && Math.abs(last[2] - h) < 1e-4) last[1] = b
        else runs.push([a, b, h])
      }
      for (const [a, b, h] of runs) {
        const path = facePath(wall, frame, others, side, a, b, y)
        sweep(trim.ceiling === 'cove' ? paint : gap, path, ceilingProfile(h), { capStart: a > 1e-3, capEnd: b < length - 1e-3 })
      }
    }
  }
  return { paint, gap }
}

function v3(p: Vec2, y: number): THREE.Vector3 {
  return new THREE.Vector3(p.x, y, p.y)
}

function n3(p: Vec2): THREE.Vector3 {
  return new THREE.Vector3(p.x, 0, p.y)
}

/**
 * Bevel strips on the exposed edges of the wall solid: free ends, outside corners, and the
 * edges of openings that no architrave covers. Each side's strips use that side's material.
 */
function edgeBevels(wall: Wall, level: Level, frame: WallFrame, others: readonly Wall[], rooms: readonly Room[]): { left: Sheet; right: Sheet } {
  const sheets = { left: new Sheet(), right: new Sheet() }
  const length = frame.length
  if (length < 0.05) return sheets
  const y0 = level.elevation
  const y1 = level.elevation + wall.height
  const grow = 0.01
  const bigger = others.map((n) => grown(n, grow))
  for (const side of [1, -1] as const) {
    const sheet = side === 1 ? sheets.left : sheets.right
    for (const end of ['a', 'b'] as const) {
      const P = wall[end]
      const joined = others.some((n) => dist(n.a, P) <= JOIN_EPS || dist(n.b, P) <= JOIN_EPS)
      const d = end === 'a' ? 0 : length
      const s = sampleFrame(frame, d)
      const along = end === 'a' ? scale(s.tangent, -1) : s.tangent
      const n1 = scale(pointNormal(frame, d), side)
      const apex = mitrePoint(wall, end, side, others)
      if (!joined) {
        edgeStrip(sheet, v3(apex, y0), v3(apex, y1), n3(n1), n3(along))
        continue
      }
      // The neighbour's face normal, recovered from the mitre: m = (n1 + n2) / (1 + n1·n2).
      const m = scale(sub(mitrePoint(grown(wall, grow), end, side, bigger), apex), 1 / grow)
      const mm = dot(m, m)
      if (mm < 1e-6) continue
      const n2 = sub(scale(m, 2 / mm), n1)
      // Outside corner: the neighbour's face turns away past the end of this one.
      if (dot(n2, along) > 0.2) edgeStrip(sheet, v3(apex, y0), v3(apex, y1), n3(n1), n3(normalize(n2)), 0.006, true)
    }
    if (wall.kind === 'half') {
      const path = facePath(wall, frame, others, side, 0, length, y1)
      for (let i = 0; i < path.length - 1; i++) {
        const o = path[i]!.o.clone().add(path[i + 1]!.o).normalize()
        edgeStrip(sheet, path[i]!.p, path[i + 1]!.p, o, UP)
      }
    }
    for (const opening of level.openings) {
      if (opening.wallId !== wall.id) continue
      if (opening.type === 'arch' || opening.type === 'round-window') continue
      const info = openingTrim(opening, wall, rooms)
      if (side === 1 ? info.casing.left : info.casing.right) continue
      const iv = openingInterval(wall, opening)
      const bottom = y0 + Math.max(0, opening.sill)
      const top = y0 + Math.min(wall.height, opening.sill + opening.height)
      const at = (t: number) => corner(wall, frame, t, side, 'none', others)
      const normal = (t: number) => n3(scale(sampleFrame(frame, t).normal, side))
      const tangent = (t: number) => n3(sampleFrame(frame, t).tangent)
      if (iv.start > 1e-3) edgeStrip(sheet, v3(at(iv.start), bottom), v3(at(iv.start), top), normal(iv.start), tangent(iv.start))
      if (iv.end < length - 1e-3) edgeStrip(sheet, v3(at(iv.end), bottom), v3(at(iv.end), top), normal(iv.end), tangent(iv.end).negate())
      const head = samples(frame, iv.start, iv.end)
      // A window's outside sill covers the bottom edge on that face.
      const sillCovered = info.interior !== 0
      for (let i = 0; i < head.length - 1; i++) {
        const ta = head[i]!
        const tb = head[i + 1]!
        const mid = normal((ta + tb) / 2)
        if (top < y1 - 1e-3) edgeStrip(sheet, v3(at(ta), top), v3(at(tb), top), mid, UP.clone().negate())
        if (opening.sill > 0.02 && !sillCovered) edgeStrip(sheet, v3(at(ta), bottom), v3(at(tb), bottom), mid, UP)
      }
    }
  }
  return sheets
}
