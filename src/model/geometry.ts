import type { Vec2 } from './types'

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s }
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y)
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function normalize(a: Vec2): Vec2 {
  const l = len(a)
  if (l < 1e-12) return { x: 0, y: 0 }
  return { x: a.x / l, y: a.y / l }
}

/** Left perpendicular. Positive bulge and "left of a→b" both use this. */
export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x }
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function rotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

/** Signed area. Counter-clockwise polygons are positive. */
export function polygonArea(pts: readonly Vec2[]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    if (!p || !q) continue
    sum += p.x * q.y - q.x * p.y
  }
  return sum / 2
}

export function polygonCentroid(pts: readonly Vec2[]): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 }
  const area = polygonArea(pts)
  if (Math.abs(area) < 1e-12) {
    let x = 0
    let y = 0
    for (const p of pts) {
      x += p.x
      y += p.y
    }
    return { x: x / pts.length, y: y / pts.length }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    if (!p || !q) continue
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

function onSegment(p: Vec2, a: Vec2, b: Vec2, eps: number): boolean {
  const ab = sub(b, a)
  const ap = sub(p, a)
  if (Math.abs(cross(ab, ap)) > eps * Math.max(1, len(ab))) return false
  const d = dot(ap, ab)
  return d >= -eps && d <= dot(ab, ab) + eps
}

/** Even-odd test. Points on the boundary count as inside. */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  if (poly.length < 3) return false
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (a && b && onSegment(p, a, b, 1e-8)) return true
  }
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (!a || !b) continue
    const crosses = a.y > p.y !== b.y > p.y
    if (!crosses) continue
    const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (p.x < x) inside = !inside
  }
  return inside
}

export interface SegmentHit {
  point: Vec2
  /** Parameter along a1→a2, clamped to [0, 1]. */
  t: number
  /** Parameter along b1→b2, clamped to [0, 1]. */
  u: number
}

export function segmentIntersection(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
  eps = 1e-9,
): SegmentHit | null {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const denom = cross(r, s)
  if (Math.abs(denom) < eps) return null
  const t = cross(sub(b1, a1), s) / denom
  const u = cross(sub(b1, a1), r) / denom
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null
  const tc = Math.min(1, Math.max(0, t))
  const uc = Math.min(1, Math.max(0, u))
  return { point: add(a1, scale(r, tc)), t: tc, u: uc }
}

/** Infinite-line intersection. Null when parallel. */
export function lineIntersection(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const denom = cross(r, s)
  if (Math.abs(denom) < 1e-12) return null
  const t = cross(sub(b1, a1), s) / denom
  return add(a1, scale(r, t))
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-18) return { point: { x: a.x, y: a.y }, t: 0 }
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2))
  return { point: add(a, scale(ab, t)), t }
}

/**
 * Snap the direction from `from` toward `to` onto a multiple of `stepRad`,
 * keeping the original distance.
 */
export function snapAngle(from: Vec2, to: Vec2, stepRad: number): Vec2 {
  const d = sub(to, from)
  const distance = len(d)
  if (distance < 1e-12 || stepRad <= 0) return { x: to.x, y: to.y }
  const ang = Math.atan2(d.y, d.x)
  const snapped = Math.round(ang / stepRad) * stepRad
  return {
    x: from.x + Math.cos(snapped) * distance,
    y: from.y + Math.sin(snapped) * distance,
  }
}

export function snapToGrid(p: Vec2, grid: number): Vec2 {
  if (grid <= 0) return { x: p.x, y: p.y }
  return {
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid,
  }
}

export interface ArcCircle {
  center: Vec2
  radius: number
  /** Angle of point `a`, radians. */
  start: number
  /** Signed sweep from `a` to `b` passing through the sagitta. */
  sweep: number
}

/**
 * Circle through a circular arc whose sagitta (bulge) is measured from the
 * chord midpoint, positive to the left of a→b.
 */
export function arcCircle(a: Vec2, b: Vec2, bulge: number): ArcCircle | null {
  const chord = sub(b, a)
  const L = len(chord)
  if (L < 1e-9 || Math.abs(bulge) < 1e-9) return null
  const n = perp(scale(chord, 1 / L))
  const s = bulge
  const radius = (L * L * 0.25 + s * s) / (2 * Math.abs(s))
  const sign = Math.sign(s)
  const mid = lerp(a, b, 0.5)
  // Centre sits on the opposite side of a minor arc's bulge.
  const center = add(mid, scale(n, s - sign * radius))
  const start = Math.atan2(a.y - center.y, a.x - center.x)
  const end = Math.atan2(b.y - center.y, b.x - center.x)
  const apex = add(mid, scale(n, s))
  const angApex = Math.atan2(apex.y - center.y, apex.x - center.x)
  let sweepCCW = end - start
  while (sweepCCW < 0) sweepCCW += Math.PI * 2
  while (sweepCCW >= Math.PI * 2) sweepCCW -= Math.PI * 2
  let rel = angApex - start
  while (rel < 0) rel += Math.PI * 2
  while (rel >= Math.PI * 2) rel -= Math.PI * 2
  const sweep = rel <= sweepCCW + 1e-4 ? sweepCCW : sweepCCW - Math.PI * 2
  return { center, radius, start, sweep }
}

/** Includes both endpoints. `segments` is the number of spans, so the result has segments+1 points. */
export function arcPoints(a: Vec2, b: Vec2, bulge: number, segments: number): Vec2[] {
  const n = Math.max(1, Math.floor(segments))
  if (Math.abs(bulge) < 1e-9) {
    const pts: Vec2[] = []
    for (let i = 0; i <= n; i++) pts.push(lerp(a, b, i / n))
    return pts
  }
  const circle = arcCircle(a, b, bulge)
  if (!circle) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]
  const pts: Vec2[] = []
  for (let i = 0; i <= n; i++) {
    const ang = circle.start + circle.sweep * (i / n)
    pts.push({
      x: circle.center.x + Math.cos(ang) * circle.radius,
      y: circle.center.y + Math.sin(ang) * circle.radius,
    })
  }
  pts[0] = { x: a.x, y: a.y }
  pts[n] = { x: b.x, y: b.y }
  return pts
}

/**
 * Offset a polyline. Positive distance is to the left of travel.
 * Mitres are clamped so a hairpin corner cannot shoot off.
 */
export function offsetPolyline(pts: readonly Vec2[], distance: number): Vec2[] {
  if (pts.length === 0) return []
  const first = pts[0]
  if (!first) return []
  if (pts.length === 1) return [{ x: first.x, y: first.y }]
  const out: Vec2[] = []
  const limit = Math.abs(distance) * 4 + 1e-6
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i]
    if (!curr) continue
    const prev = pts[i - 1]
    const next = pts[i + 1]
    if (!prev && next) {
      const d = normalize(sub(next, curr))
      out.push(add(curr, scale(perp(d), distance)))
    } else if (prev && !next) {
      const d = normalize(sub(curr, prev))
      out.push(add(curr, scale(perp(d), distance)))
    } else if (prev && next) {
      const d0 = normalize(sub(curr, prev))
      const d1 = normalize(sub(next, curr))
      const p0 = add(curr, scale(perp(d0), distance))
      const p1 = add(curr, scale(perp(d1), distance))
      const hit = lineIntersection(p0, add(p0, d0), p1, add(p1, d1))
      if (!hit || dist(hit, curr) > limit) {
        const bevel = normalize(add(perp(d0), perp(d1)))
        const fallback = len(bevel) > 1e-8 ? bevel : perp(d0)
        out.push(add(curr, scale(normalize(fallback), distance)))
      } else {
        out.push(hit)
      }
    }
  }
  return out
}

/** Plan (x, y) → world (x, elevation, y), y-up. The one mapping used everywhere. */
export function planToWorld(p: Vec2, elevation = 0): { x: number; y: number; z: number } {
  return { x: p.x, y: elevation, z: p.y }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Signed distance from `p` to a simple ring. Positive inside, negative outside,
 * zero on the boundary. Used by {@link polylabel}.
 */
export function signedDistanceToPolygon(p: Vec2, ring: readonly Vec2[]): number {
  if (ring.length < 2) return pointInPolygon(p, ring) ? 0 : -dist(p, ring[0] ?? p)
  let min = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    min = Math.min(min, dist(p, closestPointOnSegment(p, a, b).point))
  }
  if (!Number.isFinite(min)) return 0
  return pointInPolygon(p, ring) ? min : -min
}

interface LabelCell {
  x: number
  y: number
  h: number
  d: number
  max: number
}

/**
 * Pole of inaccessibility: the point inside a simple polygon farthest from any edge.
 * Mapbox's polylabel (quadtree of square cells), in metres. `precision` is the
 * acceptable error; 0.05 m is plenty for a room label.
 */
export function polylabel(ring: readonly Vec2[], precision = 0.05): Vec2 {
  if (ring.length === 0) return { x: 0, y: 0 }
  const first = ring[0]
  if (!first || ring.length < 3) return polygonCentroid(ring)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const width = maxX - minX
  const height = maxY - minY
  if (width < 1e-9 || height < 1e-9) return { x: first.x, y: first.y }

  const cellSize = Math.min(width, height)
  const h0 = cellSize / 2
  const heap: LabelCell[] = []
  const better = (a: LabelCell, b: LabelCell) => a.max > b.max

  const make = (x: number, y: number, h: number): LabelCell => {
    const d = signedDistanceToPolygon({ x, y }, ring)
    return { x, y, h, d, max: d + h * Math.SQRT2 }
  }
  const push = (cell: LabelCell) => {
    heap.push(cell)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      const a = heap[parent]
      const b = heap[i]
      if (!a || !b || better(a, b) || a.max === b.max) break
      heap[parent] = b
      heap[i] = a
      i = parent
    }
  }
  const pop = (): LabelCell | undefined => {
    const top = heap[0]
    const last = heap.pop()
    if (!top) return undefined
    if (!last || heap.length === 0) return top
    heap[0] = last
    let i = 0
    for (;;) {
      const left = i * 2 + 1
      const right = left + 1
      let largest = i
      if (left < heap.length && heap[left] && heap[largest] && better(heap[left]!, heap[largest]!)) largest = left
      if (right < heap.length && heap[right] && heap[largest] && better(heap[right]!, heap[largest]!)) largest = right
      if (largest === i) break
      const a = heap[i]
      const b = heap[largest]
      if (!a || !b) break
      heap[i] = b
      heap[largest] = a
      i = largest
    }
    return top
  }

  for (let x = minX; x < maxX - 1e-12; x += cellSize) {
    for (let y = minY; y < maxY - 1e-12; y += cellSize) {
      push(make(x + h0, y + h0, h0))
    }
  }

  const centroid = polygonCentroid(ring)
  let best = make(centroid.x, centroid.y, 0)
  const middle = make(minX + width / 2, minY + height / 2, 0)
  if (middle.d > best.d) best = middle

  const limit = Math.max(1e-6, precision)
  let guard = 0
  while (heap.length > 0 && guard < 20000) {
    guard += 1
    const current = pop()
    if (!current) break
    if (current.d > best.d) best = current
    if (current.max - best.d <= limit) continue
    const h = current.h / 2
    if (h < limit / 2) continue
    push(make(current.x - h, current.y - h, h))
    push(make(current.x + h, current.y - h, h))
    push(make(current.x - h, current.y + h, h))
    push(make(current.x + h, current.y + h, h))
  }
  return { x: best.x, y: best.y }
}
