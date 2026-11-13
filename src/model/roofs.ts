import {
  add,
  cross,
  dist,
  dot,
  perp,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  scale,
  sub,
} from './geometry'
import { detectRooms } from './rooms'
import { straightSkeleton, type SkelFace, type SkelVertex } from './skeleton'
import { cleanRing, isConvex, isOrthogonal, offsetPolygon, orientedBoundingRect } from './polygon'
import type { Level, Roof, Vec2 } from './types'

export interface RoofVertex {
  x: number
  y: number
  /** Metres above the eave, which sits on the level's wall top. */
  h: number
}

export interface RoofFace {
  ring: RoofVertex[]
  kind: 'slope' | 'gable' | 'dome'
}

export interface RoofModel {
  footprint: Vec2[]
  faces: RoofFace[]
  /** Hip and ridge segments in plan, for the 2D overlay. */
  ridges: [Vec2, Vec2][]
  /**
   * Hip roofs on polygons that are neither convex nor orthogonal use the
   * oriented bounding rectangle. Straight-skeleton hip is not attempted there.
   */
  usedBoundingRect: boolean
  cutouts: Vec2[][]
}

/** Outer face of the level: room centre-lines offset by half the wall thickness. */
export function outerOutline(level: Level): Vec2[] {
  const rooms = detectRooms(level).map((room) => cleanRing(room.polygon)).filter((ring) => ring.length >= 3)
  if (rooms.length === 0) return []
  const boundary = unionBoundary(rooms)
  if (boundary.length < 3) return []
  let thickness = 0
  for (const wall of level.walls) {
    if (wall.kind === 'railing') continue
    thickness = Math.max(thickness, wall.thickness)
  }
  if (thickness < 1e-6) return boundary
  const outer = offsetPolygon(boundary, -thickness / 2)
  return outer.length >= 3 ? outer : boundary
}

export function buildRoofModel(roof: Roof): RoofModel {
  const outline = cleanRing(roof.outline)
  const footprint = expand(outline, roof.overhang)
  const empty: RoofModel = { footprint, faces: [], ridges: [], usedBoundingRect: false, cutouts: [] }
  if (footprint.length < 3) return empty
  const pitch = Number.isFinite(roof.pitch) ? Math.min(Math.PI / 2 - 0.02, Math.max(0.01, roof.pitch)) : Math.PI / 6
  let model: RoofModel
  switch (roof.shape) {
    case 'flat':
      model = flatRoof(footprint)
      break
    case 'shed':
      model = shedRoof(footprint, pitch, roof.ridgeAngle)
      break
    case 'gable':
      model = gableRoof(footprint, pitch, roof.ridgeAngle)
      break
    case 'hip':
      model = hipRoof(footprint, pitch, (time) => time * Math.tan(pitch))
      break
    case 'mansard':
      model = mansardRoof(footprint, pitch)
      break
    case 'dome':
      model = domeRoof(footprint)
      break
    default:
      model = flatRoof(footprint)
  }
  model.cutouts = (roof.cutouts ?? []).filter((cut) => cut.length >= 3 && cut.some((p) => pointInPolygon(p, model.footprint)))
  return model
}

/** Height of the roof surface above the eave. Null when the point is outside every face. */
export function roofHeightAt(model: RoofModel, point: Vec2): number | null {
  let best: number | null = null
  for (const face of model.faces) {
    const h = heightInFace(face.ring, point)
    if (h == null) continue
    if (best == null || h > best) best = h
  }
  return best
}

export function skylightRect(centre: Vec2, angle: number, width = 0.9, depth = 1.2): Vec2[] {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) }
  const left = perp(dir)
  const hw = width / 2
  const hd = depth / 2
  return [
    add(centre, add(scale(dir, -hd), scale(left, -hw))),
    add(centre, add(scale(dir, hd), scale(left, -hw))),
    add(centre, add(scale(dir, hd), scale(left, hw))),
    add(centre, add(scale(dir, -hd), scale(left, hw))),
  ]
}

function expand(outline: Vec2[], overhang: number): Vec2[] {
  if (outline.length < 3) return outline
  if (!(overhang > 1e-4)) return outline
  const grown = offsetPolygon(outline, -overhang)
  return grown.length >= 3 ? grown : outline
}

function flatRoof(footprint: Vec2[]): RoofModel {
  return {
    footprint,
    faces: [{ kind: 'slope', ring: footprint.map((p) => ({ x: p.x, y: p.y, h: 0 })) }],
    ridges: [],
    usedBoundingRect: false,
    cutouts: [],
  }
}

function shedRoof(footprint: Vec2[], pitch: number, ridgeAngle: number): RoofModel {
  const dir = { x: Math.cos(ridgeAngle), y: Math.sin(ridgeAngle) }
  let tMin = Infinity
  for (const p of footprint) tMin = Math.min(tMin, dot(p, dir))
  const tan = Math.tan(pitch)
  const ring = footprint.map((p) => ({ x: p.x, y: p.y, h: Math.max(0, (dot(p, dir) - tMin) * tan) }))
  return { footprint, faces: [{ kind: 'slope', ring }], ridges: [], usedBoundingRect: false, cutouts: [] }
}

function gableRoof(footprint: Vec2[], pitch: number, ridgeAngle: number): RoofModel {
  const frame = orientedFrame(footprint, ridgeAngle)
  const tan = Math.tan(pitch)
  const half = (frame.maxV - frame.minV) / 2
  const heightAt = (p: Vec2) => Math.max(0, (half - Math.abs(dot(sub(p, frame.center), frame.normal))) * tan)
  const ridgeH = half * tan
  const hits = lineHits(footprint, frame.center, frame.axis)
  const faces: RoofFace[] = []
  const ridges: [Vec2, Vec2][] = []
  if (hits.length >= 2) {
    const a = hits[0]!
    const b = hits[hits.length - 1]!
    ridges.push([a, b])
    const chains = splitRing(footprint, a, b)
    for (const chain of chains) {
      const ring: RoofVertex[] = [
        ...chain.map((p) => ({ x: p.x, y: p.y, h: heightAt(p) })),
        { x: b.x, y: b.y, h: ridgeH },
        { x: a.x, y: a.y, h: ridgeH },
      ]
      if (polygonArea(ring) < 0) ring.reverse()
      faces.push({ kind: 'slope', ring })
    }
    for (const hit of [a, b]) {
      const edge = edgeUnder(footprint, hit)
      if (!edge) continue
      const gable: RoofVertex[] = [
        { x: edge.a.x, y: edge.a.y, h: heightAt(edge.a) },
        { x: edge.b.x, y: edge.b.y, h: heightAt(edge.b) },
        { x: hit.x, y: hit.y, h: ridgeH },
      ]
      faces.push({ kind: 'gable', ring: gable })
    }
  }
  if (faces.length === 0) {
    faces.push({
      kind: 'slope',
      ring: footprint.map((p) => ({ x: p.x, y: p.y, h: heightAt(p) })),
    })
  }
  return { footprint, faces, ridges, usedBoundingRect: false, cutouts: [] }
}

function hipRoof(footprint: Vec2[], pitch: number, heightOf: (time: number) => number): RoofModel {
  const convex = isConvex(footprint)
  const orthogonal = isOrthogonal(footprint)
  let usedBoundingRect = false
  let source = footprint
  if (!convex && !orthogonal) {
    source = orientedBoundingRect(footprint)
    usedBoundingRect = true
  }
  let faces = skeletonFaces(source, heightOf)
  if (!faces) {
    source = orientedBoundingRect(footprint)
    usedBoundingRect = true
    faces = skeletonFaces(source, heightOf) ?? []
  }
  const ridges = ridgeLines(faces)
  return { footprint: source, faces, ridges, usedBoundingRect, cutouts: [] }
}

function mansardRoof(footprint: Vec2[], pitch: number): RoofModel {
  const upperPitch = Math.max(0.12, pitch * 0.4)
  const probe = hipRoof(footprint, pitch, (time) => time)
  let maxTime = 0
  for (const face of probe.faces) {
    for (const v of face.ring) maxTime = Math.max(maxTime, v.h)
  }
  const breakTime = maxTime * 0.42
  const heightOf = (time: number) => {
    if (time <= breakTime) return time * Math.tan(pitch)
    return breakTime * Math.tan(pitch) + (time - breakTime) * Math.tan(upperPitch)
  }
  const base = hipRoof(footprint, pitch, (time) => time)
  const faces: RoofFace[] = []
  for (const face of base.faces) {
    const timed: SkelVertex[] = face.ring.map((v) => ({ x: v.x, y: v.y, time: v.h }))
    if (maxTime < 1e-4 || breakTime < 1e-4) {
      faces.push({ kind: 'slope', ring: timed.map((v) => ({ x: v.x, y: v.y, h: heightOf(v.time) })) })
      continue
    }
    const lower = clipTime(timed, (t) => t <= breakTime + 1e-6, breakTime)
    const upper = clipTime(timed, (t) => t >= breakTime - 1e-6, breakTime)
    if (lower.length >= 3) faces.push({ kind: 'slope', ring: lower.map((v) => ({ ...v, h: heightOf(v.time) })) })
    if (upper.length >= 3) faces.push({ kind: 'slope', ring: upper.map((v) => ({ ...v, h: heightOf(v.time) })) })
  }
  return {
    footprint: base.footprint,
    faces,
    ridges: base.ridges,
    usedBoundingRect: base.usedBoundingRect,
    cutouts: [],
  }
}

function domeRoof(footprint: Vec2[]): RoofModel {
  const centre = polygonCentroid(footprint)
  let radius = 0
  for (const p of footprint) radius = Math.max(radius, dist(p, centre))
  radius = Math.max(radius, 0.5)
  const rings = 8
  const segs = 20
  const faces: RoofFace[] = []
  for (let lat = 0; lat < rings; lat++) {
    const phi0 = (lat / rings) * (Math.PI / 2)
    const phi1 = ((lat + 1) / rings) * (Math.PI / 2)
    const r0 = radius * Math.cos(phi0)
    const r1 = radius * Math.cos(phi1)
    const h0 = radius * Math.sin(phi0)
    const h1 = radius * Math.sin(phi1)
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2
      const a1 = ((i + 1) / segs) * Math.PI * 2
      const p = (r: number, h: number, a: number): RoofVertex => ({
        x: centre.x + Math.cos(a) * r,
        y: centre.y + Math.sin(a) * r,
        h,
      })
      if (r1 < 1e-3) {
        faces.push({
          kind: 'dome',
          ring: [p(r0, h0, a0), p(r0, h0, a1), { x: centre.x, y: centre.y, h: h1 }],
        })
      } else {
        faces.push({
          kind: 'dome',
          ring: [p(r0, h0, a0), p(r0, h0, a1), p(r1, h1, a1), p(r1, h1, a0)],
        })
      }
    }
  }
  return { footprint, faces, ridges: [], usedBoundingRect: false, cutouts: [] }
}

function skeletonFaces(source: Vec2[], heightOf: (time: number) => number): RoofFace[] | null {
  const skel: SkelFace[] | null = straightSkeleton(source)
  if (!skel || skel.length === 0) return null
  return skel.map((face) => ({
    kind: 'slope' as const,
    ring: face.ring.map((v) => ({ x: v.x, y: v.y, h: heightOf(v.time) })),
  }))
}

function ridgeLines(faces: RoofFace[]): [Vec2, Vec2][] {
  const lines: [Vec2, Vec2][] = []
  const seen = new Set<string>()
  for (const face of faces) {
    const ring = face.ring
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      if (!a || !b) continue
      if (a.h < 1e-3 && b.h < 1e-3) continue
      const key = edgeKey(a, b)
      if (seen.has(key)) continue
      seen.add(key)
      lines.push([
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ])
    }
  }
  return lines
}

function edgeKey(a: Vec2, b: Vec2): string {
  const ka = `${Math.round(a.x * 100)},${Math.round(a.y * 100)}`
  const kb = `${Math.round(b.x * 100)},${Math.round(b.y * 100)}`
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

function clipTime(ring: SkelVertex[], inside: (time: number) => boolean, breakTime: number): SkelVertex[] {
  if (ring.length < 3) return []
  const out: SkelVertex[] = []
  const crossAt = (a: SkelVertex, b: SkelVertex): SkelVertex => {
    const span = b.time - a.time
    const u = Math.abs(span) < 1e-9 ? 0 : (breakTime - a.time) / span
    return {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      time: breakTime,
    }
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    const aIn = inside(a.time)
    const bIn = inside(b.time)
    if (aIn && bIn) out.push({ ...b })
    else if (aIn && !bIn) out.push(crossAt(a, b))
    else if (!aIn && bIn) {
      out.push(crossAt(a, b))
      out.push({ ...b })
    }
  }
  return out.length >= 3 ? out : []
}

interface Frame {
  center: Vec2
  axis: Vec2
  normal: Vec2
  minV: number
  maxV: number
}

function orientedFrame(poly: readonly Vec2[], angle: number): Frame {
  const axis = { x: Math.cos(angle), y: Math.sin(angle) }
  const normal = perp(axis)
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const p of poly) {
    const u = dot(p, axis)
    const v = dot(p, normal)
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }
  const midU = (minU + maxU) / 2
  const midV = (minV + maxV) / 2
  return {
    center: add(scale(axis, midU), scale(normal, midV)),
    axis,
    normal,
    minV,
    maxV,
  }
}

function lineHits(poly: readonly Vec2[], origin: Vec2, dir: Vec2): Vec2[] {
  const hits: Vec2[] = []
  const far = 1e6
  const a = add(origin, scale(dir, -far))
  const b = add(origin, scale(dir, far))
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    if (!p || !q) continue
    const hit = segmentVsLine(p, q, a, b)
    if (hit) hits.push(hit)
  }
  hits.sort((p, q) => dot(p, dir) - dot(q, dir))
  const uniq: Vec2[] = []
  for (const hit of hits) {
    if (!uniq.some((other) => dist(other, hit) < 1e-4)) uniq.push(hit)
  }
  return uniq
}

function segmentVsLine(p: Vec2, q: Vec2, a: Vec2, b: Vec2): Vec2 | null {
  const r = sub(q, p)
  const s = sub(b, a)
  const denom = cross(r, s)
  if (Math.abs(denom) < 1e-12) return null
  const t = cross(sub(a, p), s) / denom
  if (t < -1e-6 || t > 1 + 1e-6) return null
  const tc = Math.min(1, Math.max(0, t))
  return add(p, scale(r, tc))
}

function splitRing(poly: readonly Vec2[], a: Vec2, b: Vec2): Vec2[][] {
  const n = poly.length
  let ia = -1
  let ib = -1
  for (let i = 0; i < n; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % n]
    if (!p || !q) continue
    if (ia < 0 && pointOn(p, q, a) != null) ia = i
    if (ib < 0 && pointOn(p, q, b) != null) ib = i
  }
  if (ia < 0 || ib < 0) return []
  const chain = (fromEdge: number, toEdge: number, end: Vec2, start: Vec2) => {
    const pts: Vec2[] = [{ x: start.x, y: start.y }]
    let i = fromEdge
    let guard = n + 2
    while (guard-- > 0) {
      const next = poly[(i + 1) % n]
      if (i === toEdge) {
        pts.push({ x: end.x, y: end.y })
        break
      }
      if (next) pts.push({ x: next.x, y: next.y })
      i = (i + 1) % n
    }
    return pts.filter((p, index) => index === 0 || dist(p, pts[index - 1]!) > 1e-6)
  }
  // Two chains between the hit points, each walked along the boundary.
  const one = chain(ia, ib, b, a)
  const two = chain(ib, ia, a, b)
  return [one, two].filter((c) => c.length >= 2)
}

function pointOn(p: Vec2, q: Vec2, hit: Vec2): number | null {
  if (dist(hit, closest(p, q, hit)) > 1e-3) return null
  const ab = sub(q, p)
  const l2 = dot(ab, ab)
  if (l2 < 1e-12) return null
  return dot(sub(hit, p), ab) / l2
}

function closest(p: Vec2, q: Vec2, hit: Vec2): Vec2 {
  const ab = sub(q, p)
  const l2 = dot(ab, ab)
  if (l2 < 1e-12) return p
  const t = Math.min(1, Math.max(0, dot(sub(hit, p), ab) / l2))
  return add(p, scale(ab, t))
}

function edgeUnder(poly: readonly Vec2[], hit: Vec2): { a: Vec2; b: Vec2 } | null {
  let best: { a: Vec2; b: Vec2 } | null = null
  let bestD = 1e-3
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    const d = dist(hit, closest(a, b, hit))
    if (d <= bestD) {
      bestD = d
      best = { a, b }
    }
  }
  return best
}

function heightInFace(ring: readonly RoofVertex[], point: Vec2): number | null {
  if (ring.length < 3 || !pointInPolygon(point, ring)) return null
  const a0 = ring[0]
  if (!a0) return null
  for (let i = 1; i < ring.length - 1; i++) {
    const b = ring[i]
    const c = ring[i + 1]
    if (!b || !c) continue
    const w = bary(point, a0, b, c)
    if (!w) continue
    return w.a * a0.h + w.b * b.h + w.c * c.h
  }
  return null
}

function bary(p: Vec2, a: Vec2, b: Vec2, c: Vec2): { a: number; b: number; c: number } | null {
  const v0 = sub(b, a)
  const v1 = sub(c, a)
  const v2 = sub(p, a)
  const den = cross(v0, v1)
  if (Math.abs(den) < 1e-12) return null
  const wb = cross(v2, v1) / den
  const wc = cross(v0, v2) / den
  const wa = 1 - wb - wc
  if (wa < -1e-3 || wb < -1e-3 || wc < -1e-3) return null
  return { a: wa, b: wb, c: wc }
}

function unionBoundary(rings: Vec2[][]): Vec2[] {
  if (rings.length === 0) return []
  if (rings.length === 1) return rings[0] ?? []
  const verts: Vec2[] = []
  const addV = (p: Vec2): number => {
    for (let i = 0; i < verts.length; i++) {
      const q = verts[i]
      if (q && dist(q, p) <= 1e-3) return i
    }
    verts.push({ x: p.x, y: p.y })
    return verts.length - 1
  }
  let edges: { a: number; b: number }[] = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      if (!a || !b || dist(a, b) < 1e-6) continue
      const ia = addV(a)
      const ib = addV(b)
      if (ia !== ib) edges.push({ a: ia, b: ib })
    }
  }
  // Room rings drop collinear T-junctions, so a long outer edge must be split
  // where a neighbour's vertex lands on it before shared edges can cancel.
  let grew = true
  let guard = edges.length * Math.max(verts.length, 1) + 4
  while (grew && guard-- > 0) {
    grew = false
    const next: { a: number; b: number }[] = []
    for (const edge of edges) {
      const a = verts[edge.a]
      const b = verts[edge.b]
      if (!a || !b) continue
      const ab = sub(b, a)
      const l2 = dot(ab, ab)
      if (l2 < 1e-12) continue
      let best = -1
      let bestT = 2
      for (let i = 0; i < verts.length; i++) {
        if (i === edge.a || i === edge.b) continue
        const p = verts[i]
        if (!p) continue
        const t = dot(sub(p, a), ab) / l2
        if (t <= 1e-4 || t >= 1 - 1e-4) continue
        if (dist(p, add(a, scale(ab, t))) > 1e-3) continue
        if (t < bestT) {
          bestT = t
          best = i
        }
      }
      if (best >= 0) {
        next.push({ a: edge.a, b: best }, { a: best, b: edge.b })
        grew = true
      } else next.push(edge)
    }
    edges = next
  }
  const live = new Map<string, { a: number; b: number }>()
  for (const edge of edges) {
    const forward = `${edge.a}>${edge.b}`
    const back = `${edge.b}>${edge.a}`
    if (live.has(back)) live.delete(back)
    else if (!live.has(forward)) live.set(forward, edge)
  }
  const adj = new Map<number, { a: number; b: number }[]>()
  for (const edge of live.values()) {
    const list = adj.get(edge.a) ?? []
    list.push(edge)
    adj.set(edge.a, list)
  }
  const used = new Set<string>()
  let best: Vec2[] = []
  let bestArea = 0
  for (const [start, list] of adj) {
    for (const first of list) {
      const id = `${first.a}>${first.b}`
      if (used.has(id)) continue
      const loop: Vec2[] = []
      let current: { a: number; b: number } | undefined = first
      let steps = live.size + 2
      while (current && steps-- > 0) {
        const mark = `${current.a}>${current.b}`
        if (used.has(mark) && loop.length > 0) break
        used.add(mark)
        const point = verts[current.a]
        if (point) loop.push({ x: point.x, y: point.y })
        if (current.b === start && loop.length > 2) break
        const nexts: { a: number; b: number }[] = adj.get(current.b) ?? []
        current = nexts.find((edge) => !used.has(`${edge.a}>${edge.b}`))
      }
      const area = Math.abs(polygonArea(loop))
      if (area > bestArea) {
        bestArea = area
        best = cleanRing(loop)
      }
    }
  }
  return best
}
