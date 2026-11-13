import { cross, dist, dot, len, normalize, perp, polygonArea, sub } from './geometry'
import { cleanRing, convexHull } from './polygon'
import type { Vec2 } from './types'

export interface SkelVertex {
  x: number
  y: number
  /** Inward offset distance at which this vertex appears. Eaves are 0. */
  time: number
}

export interface SkelFace {
  ring: SkelVertex[]
}

interface Node {
  ox: number
  oy: number
  t0: number
  vx: number
  vy: number
  ex: number
  ey: number
  nx: number
  ny: number
  edge: number
  prev: Node
  next: Node
  alive: boolean
}

interface SkelPoint {
  x: number
  y: number
  time: number
  edges: number[]
}

/**
 * Straight skeleton of a counter-clockwise ring.
 * Convex polygons use edge events only. Orthogonal (and other) polygons also
 * take split events when a reflex vertex runs into an opposite edge.
 * Returns null when the faces do not cover the polygon — callers fall back.
 */
export function straightSkeleton(poly: readonly Vec2[]): SkelFace[] | null {
  const ring = cleanRing(poly)
  if (ring.length < 3) return null
  const nodes = initNodes(ring)
  if (!nodes) return null
  const points: SkelPoint[] = ring.map((p, i) => ({
    x: p.x,
    y: p.y,
    time: 0,
    edges: [(i - 1 + ring.length) % ring.length, i],
  }))
  const heads: Node[] = [nodes[0]!]
  let now = 0
  let guard = ring.length * ring.length * 4 + 8
  while (guard-- > 0) {
    const loops = collectLoops(heads).filter((loop) => loop.length >= 3)
    if (loops.length === 0) break
    const event = nextEvent(loops, now)
    if (!event) break
    now = Math.max(now, event.time)
    if (event.kind === 'edge') collapse(event.node, now, points, heads)
    else splitAt(event.node, event.edge, now, points, heads)
  }
  const faces = facesFrom(ring, points)
  if (faces.length !== ring.length) return null
  const covered = faces.reduce((sum, face) => sum + Math.abs(polygonArea(face.ring)), 0)
  const area = Math.abs(polygonArea(ring))
  if (!(area > 1e-6) || Math.abs(covered - area) / area > 0.08) return null
  return faces
}

function initNodes(ring: Vec2[]): Node[] | null {
  const n = ring.length
  const nodes: Node[] = []
  for (let i = 0; i < n; i++) {
    const curr = ring[i]
    const next = ring[(i + 1) % n]
    if (!curr || !next) return null
    const edge = normalize(sub(next, curr))
    if (len(edge) < 1e-8) return null
    const normal = perp(edge)
    nodes.push({
      ox: curr.x,
      oy: curr.y,
      t0: 0,
      vx: 0,
      vy: 0,
      ex: edge.x,
      ey: edge.y,
      nx: normal.x,
      ny: normal.y,
      edge: i,
      prev: null as unknown as Node,
      next: null as unknown as Node,
      alive: true,
    })
  }
  for (let i = 0; i < n; i++) {
    const node = nodes[i]
    if (!node) return null
    node.prev = nodes[(i - 1 + n) % n]!
    node.next = nodes[(i + 1) % n]!
    const vel = velocity(node.prev, node)
    if (!Number.isFinite(vel.x) || !Number.isFinite(vel.y) || Math.hypot(vel.x, vel.y) > 40) return null
    node.vx = vel.x
    node.vy = vel.y
  }
  return nodes
}

function velocity(prev: Node, node: Node): Vec2 {
  return velocityFromNormals({ x: prev.nx, y: prev.ny }, { x: node.nx, y: node.ny })
}

function velocityFromNormals(n0: Vec2, n1: Vec2): Vec2 {
  const sum = { x: n0.x + n1.x, y: n0.y + n1.y }
  const L = Math.hypot(sum.x, sum.y)
  if (L < 1e-8) return { x: 0, y: 0 }
  const bis = { x: sum.x / L, y: sum.y / L }
  const denom = bis.x * n0.x + bis.y * n0.y
  if (Math.abs(denom) < 1e-6) return { x: n0.x, y: n0.y }
  return { x: bis.x / denom, y: bis.y / denom }
}

function at(n: Node, t: number): Vec2 {
  const dt = t - n.t0
  return { x: n.ox + n.vx * dt, y: n.oy + n.vy * dt }
}

function pos0(n: Node): Vec2 {
  return { x: n.ox - n.vx * n.t0, y: n.oy - n.vy * n.t0 }
}

function collectLoops(heads: readonly Node[]): Node[][] {
  const seen = new Set<Node>()
  const loops: Node[][] = []
  for (const start of heads) {
    if (!start.alive || seen.has(start)) continue
    const loop: Node[] = []
    let cursor: Node | null = start
    let guard = 0
    while (cursor && cursor.alive && !seen.has(cursor) && guard++ < 512) {
      seen.add(cursor)
      loop.push(cursor)
      cursor = cursor.next
      if (cursor === start) break
    }
    if (loop.length >= 2 && cursor === start) loops.push(loop)
  }
  return loops
}

interface EdgeEvent {
  kind: 'edge'
  time: number
  node: Node
}

interface SplitEvent {
  kind: 'split'
  time: number
  node: Node
  edge: Node
}

function nextEvent(loops: Node[][], now: number): EdgeEvent | SplitEvent | null {
  let best: EdgeEvent | SplitEvent | null = null
  const consider = (event: EdgeEvent | SplitEvent) => {
    if (event.time < now - 1e-4) return
    if (!best || event.time < best.time - 1e-9) best = event
  }
  for (const loop of loops) {
    for (const node of loop) {
      const meet = meetTime(node, node.next)
      const closeEnough = dist(at(node, now), at(node.next, now)) < 1e-3
      if (closeEnough) consider({ kind: 'edge', time: now, node })
      else if (meet != null && meet >= now - 1e-5) consider({ kind: 'edge', time: meet, node })
      if (!isReflex(node, now)) continue
      for (const edge of loop) {
        if (edge === node || edge === node.prev || edge.next === node) continue
        const hit = splitTime(node, edge, now)
        if (hit != null) consider({ kind: 'split', time: hit, node, edge })
      }
    }
  }
  return best
}

function meetTime(a: Node, b: Node): number | null {
  const A = pos0(a)
  const B = pos0(b)
  const dvx = a.vx - b.vx
  const dvy = a.vy - b.vy
  const denom = dvx * dvx + dvy * dvy
  if (denom < 1e-12) return null
  const t = ((B.x - A.x) * dvx + (B.y - A.y) * dvy) / denom
  const pa = { x: A.x + a.vx * t, y: A.y + a.vy * t }
  const pb = { x: B.x + b.vx * t, y: B.y + b.vy * t }
  if (dist(pa, pb) > 1e-2) return null
  return t
}

function splitTime(reflex: Node, edge: Node, now: number): number | null {
  const n = { x: edge.nx, y: edge.ny }
  const er = pos0(reflex)
  const ee = pos0(edge)
  const vr = { x: reflex.vx, y: reflex.vy }
  const ve = { x: edge.vx, y: edge.vy }
  const denom = dot(sub(vr, ve), n)
  if (Math.abs(denom) < 1e-8) return null
  const t = dot(sub(ee, er), n) / denom
  if (t < now - 1e-4) return null
  const hit = at(reflex, t)
  if (!onSegment(edge, t, hit)) return null
  return t
}

function onSegment(edge: Node, t: number, hit: Vec2): boolean {
  const a = at(edge, t)
  const b = at(edge.next, t)
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-10) return false
  const u = dot(sub(hit, a), ab) / l2
  if (u <= 0.03 || u >= 0.97) return false
  const closest = { x: a.x + ab.x * u, y: a.y + ab.y * u }
  return dist(closest, hit) < 1e-2
}

function isReflex(node: Node, t: number): boolean {
  const a = at(node.prev, t)
  const b = at(node, t)
  const c = at(node.next, t)
  return cross(sub(b, a), sub(c, b)) < -1e-7
}

function collapse(a: Node, time: number, points: SkelPoint[], heads: Node[]): void {
  const b = a.next
  if (!a.alive || !b.alive) return
  const point = at(a, time)
  const prev = a.prev
  const next = b.next
  points.push({
    x: point.x,
    y: point.y,
    time,
    edges: uniqueEdges([prev.edge, a.edge, b.edge]),
  })
  a.alive = false
  b.alive = false
  if (prev === next || prev === b || next === a) return
  const created = spawn(point, time, b, prev)
  created.prev = prev
  created.next = next
  prev.next = created
  next.prev = created
  heads.push(created)
}

function splitAt(reflex: Node, edgeStart: Node, time: number, points: SkelPoint[], heads: Node[]): void {
  if (!reflex.alive || !edgeStart.alive || !edgeStart.next.alive) return
  const point = at(reflex, time)
  const end = edgeStart.next
  const rPrev = reflex.prev
  const rNext = reflex.next
  points.push({
    x: point.x,
    y: point.y,
    time,
    edges: uniqueEdges([edgeStart.edge, rPrev.edge, reflex.edge]),
  })
  const v1 = spawn(point, time, reflex, edgeStart)
  const v2 = spawn(point, time, edgeStart, rPrev)
  edgeStart.next = v1
  v1.prev = edgeStart
  v1.next = rNext
  rNext.prev = v1
  rPrev.next = v2
  v2.prev = rPrev
  v2.next = end
  end.prev = v2
  reflex.alive = false
  heads.push(v1, v2)
}

function spawn(point: Vec2, time: number, outgoing: Node, incoming: Node): Node {
  const node: Node = {
    ox: point.x,
    oy: point.y,
    t0: time,
    vx: 0,
    vy: 0,
    ex: outgoing.ex,
    ey: outgoing.ey,
    nx: outgoing.nx,
    ny: outgoing.ny,
    edge: outgoing.edge,
    prev: outgoing,
    next: outgoing,
    alive: true,
  }
  const vel = velocityFromNormals({ x: incoming.nx, y: incoming.ny }, { x: node.nx, y: node.ny })
  node.vx = vel.x
  node.vy = vel.y
  return node
}

function uniqueEdges(ids: number[]): number[] {
  const out: number[] = []
  for (const id of ids) if (!out.includes(id)) out.push(id)
  return out
}

function facesFrom(ring: Vec2[], points: SkelPoint[]): SkelFace[] {
  const faces: SkelFace[] = []
  for (let edge = 0; edge < ring.length; edge++) {
    const mine = points.filter((p) => p.edges.includes(edge))
    const hull = convexHull(mine)
    if (hull.length < 3) return []
    const ringPts: SkelVertex[] = hull.map((p) => {
      let best = mine[0]
      let bestD = Infinity
      for (const candidate of mine) {
        const d = dist(candidate, p)
        if (d < bestD) {
          bestD = d
          best = candidate
        }
      }
      return { x: p.x, y: p.y, time: best?.time ?? 0 }
    })
    faces.push({ ring: ringPts })
  }
  return faces
}
