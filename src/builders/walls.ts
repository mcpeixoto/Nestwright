import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { add, dist, dot, lerp, normalize, perp, scale, sub } from '../model/geometry'
import type { Level, Vec2, Wall } from '../model/types'
import { openingInterval, sampleFrame, wallFrame, wallLength, mitrePoint, type WallFrame } from '../model/walls'

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
export function buildWall(wall: Wall, level: Level, neighbours: readonly Wall[]): THREE.Group {
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
  return group
}
