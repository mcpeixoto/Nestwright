import earcut from 'earcut'
import {
  add,
  closestPointOnSegment,
  cross,
  dist,
  dot,
  len,
  lineIntersection,
  normalize,
  perp,
  pointInPolygon,
  polygonArea,
  scale,
  segmentIntersection,
  sub,
} from './geometry'
import type { Vec2 } from './types'

/** Drop duplicates and force counter-clockwise. */
export function cleanRing(pts: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const p of pts) {
    const prev = out[out.length - 1]
    if (prev && dist(prev, p) < 1e-6) continue
    out.push({ x: p.x, y: p.y })
  }
  if (out.length > 1 && dist(out[0]!, out[out.length - 1]!) < 1e-6) out.pop()
  if (out.length >= 3 && polygonArea(out) < 0) out.reverse()
  return out
}

export function isConvex(poly: readonly Vec2[]): boolean {
  if (poly.length < 3) return false
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const c = poly[(i + 2) % poly.length]
    if (!a || !b || !c) continue
    const cr = cross(sub(b, a), sub(c, b))
    if (Math.abs(cr) < 1e-8) continue
    const s = Math.sign(cr)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return sign !== 0
}

/** Every edge is parallel to the first edge or to its left perpendicular. */
export function isOrthogonal(poly: readonly Vec2[]): boolean {
  if (poly.length < 3) return false
  const first = poly[0]
  const second = poly[1]
  if (!first || !second) return false
  const axis = normalize(sub(second, first))
  if (len(axis) < 1e-8) return false
  const other = perp(axis)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) return false
    const d = normalize(sub(b, a))
    if (len(d) < 1e-8) return false
    const along = Math.abs(cross(d, axis)) < 1e-3 || Math.abs(cross(d, other)) < 1e-3
    if (!along) return false
  }
  return true
}

/**
 * Closed offset. Positive distance is to the left of a counter-clockwise ring
 * (inward). Mitres that run away are bevelled.
 */
export function offsetPolygon(pts: readonly Vec2[], distance: number): Vec2[] {
  const n = pts.length
  if (n === 0) return []
  if (n < 3 || Math.abs(distance) < 1e-9) return pts.map((p) => ({ x: p.x, y: p.y }))
  const out: Vec2[] = []
  const limit = Math.abs(distance) * 8 + 1e-6
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const curr = pts[i]
    const next = pts[(i + 1) % n]
    if (!prev || !curr || !next) continue
    const d0 = normalize(sub(curr, prev))
    const d1 = normalize(sub(next, curr))
    if (len(d0) < 1e-8 || len(d1) < 1e-8) {
      out.push({ x: curr.x, y: curr.y })
      continue
    }
    const p0 = add(curr, scale(perp(d0), distance))
    const p1 = add(curr, scale(perp(d1), distance))
    const hit = lineIntersection(p0, add(p0, d0), p1, add(p1, d1))
    if (!hit || dist(hit, curr) > limit) {
      const bevel = add(perp(d0), perp(d1))
      const fallback = len(bevel) > 1e-8 ? normalize(bevel) : perp(d0)
      out.push(add(curr, scale(fallback, distance)))
    } else {
      out.push(hit)
    }
  }
  return cleanRing(out)
}

export function convexHull(pts: readonly Vec2[]): Vec2[] {
  const uniq: Vec2[] = []
  for (const p of pts) {
    if (!uniq.some((q) => dist(q, p) < 1e-6)) uniq.push({ x: p.x, y: p.y })
  }
  if (uniq.length < 3) return uniq
  uniq.sort((a, b) => a.x - b.x || a.y - b.y)
  const cross2 = (o: Vec2, a: Vec2, b: Vec2) => cross(sub(a, o), sub(b, o))
  const lower: Vec2[] = []
  for (const p of uniq) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-12) lower.pop()
    lower.push(p)
  }
  const upper: Vec2[] = []
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]
    if (!p) continue
    while (upper.length >= 2 && cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-12) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return cleanRing([...lower, ...upper])
}

/** Minimum-area rectangle around the convex hull, counter-clockwise. */
export function orientedBoundingRect(poly: readonly Vec2[]): Vec2[] {
  const hull = convexHull(poly)
  if (hull.length < 3) return hull.map((p) => ({ x: p.x, y: p.y }))
  let best: Vec2[] = hull
  let bestArea = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    if (!a || !b) continue
    const edge = normalize(sub(b, a))
    if (len(edge) < 1e-8) continue
    const n = perp(edge)
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const p of hull) {
      const u = dot(p, edge)
      const v = dot(p, n)
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    const area = (maxU - minU) * (maxV - minV)
    if (area < bestArea) {
      bestArea = area
      const corner = (u: number, v: number) => add(scale(edge, u), scale(n, v))
      best = [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)]
    }
  }
  return cleanRing(best)
}

export function distanceToBoundary(p: Vec2, poly: readonly Vec2[]): number {
  if (poly.length < 2) return Infinity
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    min = Math.min(min, dist(p, closestPointOnSegment(p, a, b).point))
  }
  return min
}

function strictlyInside(p: Vec2, poly: readonly Vec2[]): boolean {
  if (!pointInPolygon(p, poly)) return false
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    if (dist(p, closestPointOnSegment(p, a, b).point) < 1e-5) return false
  }
  return true
}

/** Positive-area overlap. Shared edges and touching corners do not count. */
export function areasOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  if (a.length < 3 || b.length < 3) return false
  const probe = (poly: readonly Vec2[], q: Vec2) => strictlyInside(q, poly)
  let cx = 0
  let cy = 0
  for (const p of a) {
    cx += p.x
    cy += p.y
  }
  if (probe(b, { x: cx / a.length, y: cy / a.length })) return true
  cx = 0
  cy = 0
  for (const p of b) {
    cx += p.x
    cy += p.y
  }
  if (probe(a, { x: cx / b.length, y: cy / b.length })) return true
  for (const p of a) if (probe(b, p)) return true
  for (const p of b) if (probe(a, p)) return true
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    if (!a1 || !a2) continue
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]
      const b2 = b[(j + 1) % b.length]
      if (!b1 || !b2) continue
      const hit = segmentIntersection(a1, a2, b1, b2)
      if (hit && hit.t > 1e-4 && hit.t < 1 - 1e-4 && hit.u > 1e-4 && hit.u < 1 - 1e-4) return true
    }
  }
  return false
}

/** Clip `subject` to a convex `clip` ring (Sutherland–Hodgman). */
export function clipToConvex(subject: readonly Vec2[], clip: readonly Vec2[]): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return []
  let output = subject.map((p) => ({ x: p.x, y: p.y }))
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    if (!a || !b) continue
    const input = output
    output = []
    const inside = (p: Vec2) => cross(sub(b, a), sub(p, a)) >= -1e-9
    for (let j = 0; j < input.length; j++) {
      const s = input[j]
      const e = input[(j + 1) % input.length]
      if (!s || !e) continue
      const sIn = inside(s)
      const eIn = inside(e)
      if (sIn && eIn) output.push(e)
      else if (sIn && !eIn) {
        const hit = lineIntersection(s, e, a, b)
        if (hit) output.push(hit)
      } else if (!sIn && eIn) {
        const hit = lineIntersection(s, e, a, b)
        if (hit) output.push(hit)
        output.push(e)
      }
    }
    if (output.length < 3) return []
  }
  return cleanRing(output)
}

/** Counter-clockwise triangles of a simple ring. Concave rings are fine. */
export function triangulate(ring: readonly Vec2[]): Vec2[][] {
  const clean = cleanRing(ring)
  if (clean.length < 3) return []
  const flat: number[] = []
  for (const p of clean) flat.push(p.x, p.y)
  const indices = earcut(flat)
  const out: Vec2[][] = []
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = clean[indices[i] ?? -1]
    const b = clean[indices[i + 1] ?? -1]
    const c = clean[indices[i + 2] ?? -1]
    if (!a || !b || !c) continue
    const tri = [a, b, c]
    const area = polygonArea(tri)
    if (Math.abs(area) < 1e-12) continue
    out.push(area < 0 ? tri.reverse() : tri)
  }
  return out
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function boundsOf(pts: readonly Vec2[]): Box {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of pts) {
    box.minX = Math.min(box.minX, p.x)
    box.minY = Math.min(box.minY, p.y)
    box.maxX = Math.max(box.maxX, p.x)
    box.maxY = Math.max(box.maxY, p.y)
  }
  return box
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

/**
 * Area shared by two simple rings, convex or not. Both are cut into triangles and
 * every pair is clipped, so concave rooms (L, U shapes) come out exact.
 */
export function intersectionArea(a: readonly Vec2[], b: readonly Vec2[]): number {
  if (a.length < 3 || b.length < 3) return 0
  if (!boxesOverlap(boundsOf(a), boundsOf(b))) return 0
  const left = triangulate(a).map((tri) => ({ tri, box: boundsOf(tri) }))
  const right = triangulate(b).map((tri) => ({ tri, box: boundsOf(tri) }))
  let sum = 0
  for (const p of left) {
    for (const q of right) {
      if (!boxesOverlap(p.box, q.box)) continue
      const piece = clipToConvex(p.tri, q.tri)
      if (piece.length >= 3) sum += polygonArea(piece)
    }
  }
  return sum
}
