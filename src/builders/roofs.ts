import earcut from 'earcut'
import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { add, dot, normalize, perp, pointInPolygon, polygonArea, scale, sub } from '../model/geometry'
import { clipToConvex, isConvex } from '../model/polygon'
import { buildRoofModel, type RoofFace, type RoofModel, type RoofVertex } from '../model/roofs'
import type { Level, MaterialRef, Roof, Vec2 } from '../model/types'
import { mitre, prism, Sheet, sweep, type PathFrame, type ProfilePoint, type UvBasis } from './trim'
import { metricUVs } from './uv'

/**
 * Roof shell: sloped faces (and gable infill) extruded by `thickness`, with the
 * eaves closed. UVs are metres along the face so tiles keep their real size.
 * Rectangular cutouts become glazed frames.
 */
export function buildRoof(roof: Roof, level: Level): THREE.Group {
  const group = new THREE.Group()
  group.userData.entityId = roof.id
  group.userData.kind = 'roof'
  group.userData.roof = true
  const model = buildRoofModel(roof)
  if (model.faces.length === 0) return group
  const y0 = level.elevation + level.height
  const material = getMaterial(roof.material)
  const gableMat = getMaterial({ id: 'plaster-white' })
  const thickness = Math.max(0.02, roof.thickness || 0.08)
  for (const face of model.faces) {
    const mesh = faceMesh(face, model.cutouts, y0, thickness, face.kind === 'gable' ? gableMat : material, roof.id)
    if (mesh) group.add(mesh)
  }
  for (const cut of model.cutouts) {
    const frame = skylight(cut, model, y0, roof.id)
    if (frame) group.add(frame)
  }
  if (roof.shape !== 'flat' && roof.shape !== 'dome') {
    const trim = roofTrim(model, y0, thickness, Math.max(0, roof.overhang), level.elevation)
    for (const [sheet, mat, name] of [
      [trim.tiles, material, 'ridge'],
      [trim.fascia, getMaterial(FASCIA), 'fascia'],
      [trim.metal, getMaterial(GUTTER), 'gutter'],
    ] as const) {
      const mesh = sheet.mesh(mat)
      if (!mesh) continue
      mesh.userData.entityId = roof.id
      mesh.userData.kind = 'roof'
      mesh.userData.roof = true
      mesh.userData.trim = name
      group.add(mesh)
    }
  }
  return group
}

const FASCIA: MaterialRef = { id: 'render-stucco' }
const GUTTER: MaterialRef = { id: 'steel-brushed' }
const GUTTER_RADIUS = 0.065
const PIPE_RADIUS = 0.04

const key2 = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`

function world(p: RoofVertex, y0: number): THREE.Vector3 {
  return new THREE.Vector3(p.x, y0 + p.h, p.y)
}

interface Eave {
  a: Vec2
  b: Vec2
  /** Plan direction out of the roof, square to the edge. */
  out: Vec2
}

/**
 * Roof trim: ridge and hip caps where two slopes meet, a barge strip that thickens the tile edge
 * at the verges, and along the eaves a fascia board, a half-round gutter and a downpipe at each
 * gutter end (each corner on a hipped roof) running down the wall to the ground.
 */
function roofTrim(model: RoofModel, y0: number, thickness: number, overhang: number, floor: number): { tiles: Sheet; fascia: Sheet; metal: Sheet } {
  const tiles = new Sheet()
  const fascia = new Sheet()
  const metal = new Sheet()
  const slopes = model.faces
    .filter((f) => f.kind === 'slope')
    .map((f) => {
      const ring = f.ring.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.h))
      const outer = polygonArea(ring) < 0 ? [...ring].reverse() : ring
      const centre = new THREE.Vector3()
      for (const p of outer) centre.add(world(p, y0))
      centre.divideScalar(Math.max(1, outer.length))
      const normal = faceNormal(outer)
      return { ring: outer, normal, centre, basis: planeBasis(world(outer[0] ?? { x: 0, y: 0, h: 0 }, y0), normal) }
    })
    .filter((f) => f.ring.length >= 3)
  type Edge = { face: number; a: RoofVertex; b: RoofVertex }
  const edges = new Map<string, Edge[]>()
  slopes.forEach((face, fi) => {
    for (let i = 0; i < face.ring.length; i++) {
      const a = face.ring[i]!
      const b = face.ring[(i + 1) % face.ring.length]!
      if (Math.hypot(b.x - a.x, b.y - a.y, b.h - a.h) < 1e-3) continue
      const ka = key2(a.x, a.y)
      const kb = key2(b.x, b.y)
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const list = edges.get(k) ?? []
      list.push({ face: fi, a, b })
      edges.set(k, list)
    }
  })
  const eaves: Eave[] = []
  for (const list of edges.values()) {
    const first = list[0]!
    const face = slopes[first.face]!
    const a = world(first.a, y0)
    const b = world(first.b, y0)
    if (list.length >= 2) {
      const other = slopes[list[1]!.face]!
      ridgeCap(tiles, a, b, face, other, thickness)
      continue
    }
    if (Math.abs(first.a.h) < 1e-3 && Math.abs(first.b.h) < 1e-3) {
      const dir = normalize(sub({ x: first.b.x, y: first.b.y }, { x: first.a.x, y: first.a.y }))
      let out = perp(dir)
      const mid = { x: (first.a.x + first.b.x) / 2, y: (first.a.y + first.b.y) / 2 }
      if (dot(out, { x: face.centre.x - mid.x, y: face.centre.z - mid.y }) > 0) out = { x: -out.x, y: -out.y }
      eaves.push({ a: { x: first.a.x, y: first.a.y }, b: { x: first.b.x, y: first.b.y }, out })
      continue
    }
    vergeStrip(tiles, a, b, face, thickness)
  }
  eaveTrim(fascia, metal, eaves, y0, overhang, floor)
  return { tiles, fascia, metal }
}

interface SlopeInfo {
  normal: THREE.Vector3
  centre: THREE.Vector3
  basis: UvBasis
}

/** Away from the edge a→b, within the face plane, towards the face's own side. */
function inward(a: THREE.Vector3, b: THREE.Vector3, face: SlopeInfo): THREE.Vector3 {
  const e = b.clone().sub(a).normalize()
  const d = new THREE.Vector3().crossVectors(e, face.normal).normalize()
  if (d.dot(face.centre.clone().sub(a)) < 0) d.negate()
  return d
}

function ridgeCap(sheet: Sheet, a: THREE.Vector3, b: THREE.Vector3, A: SlopeInfo, B: SlopeInfo, thickness: number): void {
  const lift = mitre(A.normal, B.normal).multiplyScalar(thickness)
  const up = A.normal.clone().add(B.normal).normalize()
  const dA = inward(a, b, A)
  const dB = inward(a, b, B)
  const wing = 0.13
  const rows = (p: THREE.Vector3) => {
    const r = p.clone().add(lift)
    return {
      r,
      sa: r.clone().addScaledVector(dA, wing).addScaledVector(A.normal, 0.008),
      ma: r.clone().addScaledVector(dA, wing * 0.45).addScaledVector(up, 0.03),
      top: r.clone().addScaledVector(up, 0.042),
      mb: r.clone().addScaledVector(dB, wing * 0.45).addScaledVector(up, 0.03),
      sb: r.clone().addScaledVector(dB, wing).addScaledVector(B.normal, 0.008),
    }
  }
  const p = rows(a)
  const q = rows(b)
  const strip = [p.sa, p.ma, p.top, p.mb, p.sb]
  const strip2 = [q.sa, q.ma, q.top, q.mb, q.sb]
  let v0 = 0
  for (let k = 0; k < strip.length - 1; k++) {
    const hint = strip[k]!.clone().add(strip[k + 1]!).multiplyScalar(0.5).sub(p.r)
    sheet.quad(strip[k]!, strip2[k]!, strip2[k + 1]!, strip[k + 1]!, hint, 0, v0)
    v0 += strip[k]!.distanceTo(strip[k + 1]!)
  }
  // Underside lips down to the tiles, then the open ends.
  const e = b.clone().sub(a).normalize()
  sheet.quad(p.sa, q.sa, q.sa.clone().addScaledVector(A.normal, -0.012), p.sa.clone().addScaledVector(A.normal, -0.012), dA)
  sheet.quad(p.sb, q.sb, q.sb.clone().addScaledVector(B.normal, -0.012), p.sb.clone().addScaledVector(B.normal, -0.012), dB)
  sheet.poly([p.r, ...strip], e.clone().negate())
  sheet.poly([q.r, ...strip2], e)
}

function vergeStrip(sheet: Sheet, a: THREE.Vector3, b: THREE.Vector3, face: SlopeInfo, thickness: number): void {
  const n = face.normal
  const out = inward(a, b, face).negate()
  const corners = (p: THREE.Vector3) => ({
    ti: p.clone().addScaledVector(n, thickness + 0.014).addScaledVector(out, -0.09),
    to: p.clone().addScaledVector(n, thickness + 0.014).addScaledVector(out, 0.03),
    bo: p.clone().addScaledVector(n, -0.045).addScaledVector(out, 0.03),
    bi: p.clone().addScaledVector(n, -0.045),
  })
  const p = corners(a)
  const q = corners(b)
  sheet.quad(p.ti, q.ti, q.to, p.to, n, 0, 0, face.basis)
  sheet.quad(p.to, q.to, q.bo, p.bo, out)
  sheet.quad(p.bo, q.bo, q.bi, p.bi, n.clone().negate())
  // Close the lower end (the eave corner).
  const low = a.y <= b.y ? p : q
  const along = (a.y <= b.y ? a.clone().sub(b) : b.clone().sub(a)).normalize()
  sheet.poly([low.ti, low.to, low.bo, low.bi], along)
}

/** Fascia board, half-round gutter and downpipes along chained eave edges. */
/**
 * Downpipes run to the floor of the roof's own level: the ground on a ground-floor roof, the
 * terrace or lower roof under an upper storey (the storey below may stand further out).
 */
function eaveTrim(fascia: Sheet, metal: Sheet, eaves: readonly Eave[], y0: number, overhang: number, floor: number): void {
  const at = new Map<string, Eave[]>()
  for (const e of eaves) {
    for (const p of [e.a, e.b]) {
      const k = key2(p.x, p.y)
      const list = at.get(k) ?? []
      list.push(e)
      at.set(k, list)
    }
  }
  const up = new THREE.Vector3(0, 1, 0)
  const r = GUTTER_RADIUS
  const top = -0.012
  // Fascia: a 200 mm board tucked under the eave, its face just behind the roof edge.
  const board: ProfilePoint[] = [
    [-0.2, -0.03],
    [0, -0.03],
    [0, -0.005],
    [-0.196, -0.005],
    [-0.2, -0.009],
    [-0.2, -0.03],
  ]
  // Gutter: outer skin front lip → bottom → back lip, then the inner skin back again.
  const gutter: ProfilePoint[] = []
  const segs = 10
  const centre: ProfilePoint = [top, r]
  for (let k = segs; k >= 0; k--) {
    const t = (k / segs) * Math.PI
    gutter.push([centre[0] - r * Math.sin(t), centre[1] - r * Math.cos(t)])
  }
  for (let k = 0; k <= segs; k++) {
    const t = (k / segs) * Math.PI
    gutter.push([centre[0] - (r - 0.0025) * Math.sin(t), centre[1] - (r - 0.0025) * Math.cos(t)])
  }
  gutter.push(gutter[0]!)
  const pipes: { p: Vec2; along: Vec2; out: Vec2 }[] = []
  for (const e of eaves) {
    const frame = (p: Vec2): { f: PathFrame; open: boolean; corner: boolean } => {
      const others = (at.get(key2(p.x, p.y)) ?? []).filter((o) => o !== e)
      const next = others[0]
      const out = next ? mitre(new THREE.Vector3(e.out.x, 0, e.out.y), new THREE.Vector3(next.out.x, 0, next.out.y)) : new THREE.Vector3(e.out.x, 0, e.out.y)
      // Outlines carry collinear points where inner walls meet the shell: not a corner.
      const corner = !!next && dot(e.out, next.out) < 0.95
      return { f: { p: new THREE.Vector3(p.x, y0, p.y), s: up, o: out }, open: !next, corner }
    }
    const fa = frame(e.a)
    const fb = frame(e.b)
    const path = [fa.f, fb.f]
    sweep(fascia, path, board, { skip: [1], capStart: fa.open, capEnd: fb.open })
    sweep(metal, path, gutter, {})
    const dir = normalize(sub(e.b, e.a))
    for (const [f, open, corner, along] of [
      [fa.f, fa.open, fa.corner, dir],
      [fb.f, fb.open, fb.corner, { x: -dir.x, y: -dir.y }],
    ] as const) {
      // Stop ends: a half disc over the open gutter end.
      if (open) {
        const disc = gutter.slice(0, segs + 1).map(([a, b]) => f.p.clone().addScaledVector(f.s, a).addScaledVector(f.o, b))
        metal.poly(disc, new THREE.Vector3(-along.x, 0, -along.y))
      }
      // One downpipe per gutter end; at a shared corner, only the edge that starts there.
      if (open || (corner && f === fa.f)) pipes.push({ p: { x: f.p.x, y: f.p.z }, along, out: e.out })
    }
  }
  if (y0 - floor < 0.5) return
  for (const pipe of pipes) {
    const inset = overhang + 0.14
    const base = add(pipe.p, scale(pipe.along, inset))
    const outlet = add(base, scale(pipe.out, r))
    const wall = add(base, scale(pipe.out, -overhang + PIPE_RADIUS + 0.02))
    const yTop = y0 + top - r + 0.01
    const yBend = yTop - 0.12
    const yWall = yBend - Math.max(0.12, Math.abs(r + overhang) * 0.6)
    const pts = [
      new THREE.Vector3(outlet.x, yTop, outlet.y),
      new THREE.Vector3(outlet.x, yBend, outlet.y),
      new THREE.Vector3(wall.x, yWall, wall.y),
      new THREE.Vector3(wall.x, floor + 0.03, wall.y),
    ]
    for (let i = 0; i < pts.length - 1; i++) prism(metal, pts[i]!, pts[i + 1]!, PIPE_RADIUS, 8)
    // Shoe kicking out at the foot.
    const foot = pts[3]!
    prism(metal, foot.clone().setY(floor + 0.12), foot.clone().add(new THREE.Vector3(pipe.out.x * 0.1, 0, pipe.out.y * 0.1)).setY(floor + 0.04), PIPE_RADIUS, 8, true)
  }
}

function faceMesh(
  face: RoofFace,
  cutouts: Vec2[][],
  y0: number,
  thickness: number,
  material: THREE.Material,
  id: string,
): THREE.Mesh | null {
  const ring = face.ring.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.h))
  if (ring.length < 3) return null
  const holes = holesInFace(ring, cutouts)
  const flat: number[] = []
  const verts: RoofVertex[] = []
  const outer = polygonArea(ring) < 0 ? [...ring].reverse() : ring
  for (const p of outer) {
    flat.push(p.x, p.y)
    verts.push(p)
  }
  const holeStarts: number[] = []
  for (const hole of holes) {
    const cw = polygonArea(hole) > 0 ? [...hole].reverse() : hole
    holeStarts.push(flat.length / 2)
    for (const p of cw) {
      flat.push(p.x, p.y)
      verts.push({ x: p.x, y: p.y, h: planeHeight(outer, p.x, p.y) })
    }
  }
  let indices: number[]
  try {
    indices = earcut(flat, holeStarts.length ? holeStarts : undefined, 2)
  } catch {
    return null
  }
  if (indices.length < 3) return null
  const normal = faceNormal(outer)
  const thick = face.kind === 'gable' ? Math.max(thickness, 0.12) : thickness
  const top = verts.map((p) => shift(p, normal, thick))
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const push = (p: RoofVertex, n: THREE.Vector3, uv = metricUv(p, outer[0] ?? p, normal)) => {
    positions.push(p.x, y0 + p.h, p.y)
    normals.push(n.x, n.y, n.z)
    uvs.push(uv[0], uv[1])
  }
  const index: number[] = []
  const base = 0
  for (const p of top) push(p, normal)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] ?? 0
    const b = indices[i + 1] ?? 0
    const c = indices[i + 2] ?? 0
    index.push(base + a, base + b, base + c)
  }
  const bottomStart = verts.length
  const down = normal.clone().multiplyScalar(-1)
  for (const p of verts) push(p, down)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] ?? 0
    const b = indices[i + 1] ?? 0
    const c = indices[i + 2] ?? 0
    index.push(bottomStart + a, bottomStart + c, bottomStart + b)
  }
  // Fascia on edges that belong to only one triangle: eaves, hole rims, gable base.
  const edgeCount = new Map<string, { a: number; b: number; n: number }>()
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const found = edgeCount.get(key)
    if (found) found.n += 1
    else edgeCount.set(key, { a, b, n: 1 })
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] ?? 0
    const b = indices[i + 1] ?? 0
    const c = indices[i + 2] ?? 0
    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
  }
  for (const edge of edgeCount.values()) {
    if (edge.n !== 1) continue
    const a = top[edge.a]
    const b = top[edge.b]
    const c = verts[edge.a]
    const d = verts[edge.b]
    if (!a || !b || !c || !d) continue
    const i0 = positions.length / 3
    const outward = edgeOutward(a, b, normal)
    // The fascia stands square to the roof plane, so the plane's projection would squash its
    // thickness to nothing. Metres along the edge by metres across the thickness instead.
    const length = Math.hypot(b.x - a.x, b.h - a.h, b.y - a.y)
    push(a, outward, [0, thick])
    push(b, outward, [length, thick])
    push(d, outward, [length, 0])
    push(c, outward, [0, 0])
    index.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  const mesh = new THREE.Mesh(geo, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.entityId = id
  mesh.userData.kind = 'roof'
  mesh.userData.roof = true
  return mesh
}

function holesInFace(ring: RoofVertex[], cutouts: Vec2[][]): Vec2[][] {
  const plan = ring.map((p) => ({ x: p.x, y: p.y }))
  const out: Vec2[][] = []
  for (const cut of cutouts) {
    if (cut.length < 3) continue
    if (cut.every((p) => pointInPolygon(p, plan))) {
      out.push(cut.map((p) => ({ x: p.x, y: p.y })))
      continue
    }
    if (isConvex(plan)) {
      const clipped = clipToConvex(cut, plan)
      if (clipped.length >= 3 && Math.abs(polygonArea(clipped)) > 0.02) out.push(clipped)
    }
  }
  return out
}

function planeHeight(ring: RoofVertex[], x: number, y: number): number {
  const a = ring[0]
  const b = ring[1]
  const c = ring[2]
  if (!a || !b || !c) return 0
  const ab = { x: b.x - a.x, y: b.y - a.y, h: b.h - a.h }
  const ac = { x: c.x - a.x, y: c.y - a.y, h: c.h - a.h }
  const n = {
    x: ab.y * ac.h - ab.h * ac.y,
    y: ab.h * ac.x - ab.x * ac.h,
    z: ab.x * ac.y - ab.y * ac.x,
  }
  if (Math.abs(n.z) < 1e-8) return a.h
  // n · (p - a) = 0, p = (x, y, h)
  return a.h - (n.x * (x - a.x) + n.y * (y - a.y)) / n.z
}

function faceNormal(ring: RoofVertex[]): THREE.Vector3 {
  const n = new THREE.Vector3()
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    n.x += (a.h - b.h) * (a.y + b.y)
    n.y += (a.y - b.y) * (a.x + b.x)
    n.z += (a.x - b.x) * (a.h + b.h)
  }
  if (n.lengthSq() < 1e-10) n.set(0, 1, 0)
  n.normalize()
  if (n.y < 0) n.multiplyScalar(-1)
  return n
}

function shift(p: RoofVertex, normal: THREE.Vector3, distance: number): RoofVertex {
  return {
    x: p.x + normal.x * distance,
    y: p.y + normal.z * distance,
    h: p.h + normal.y * distance,
  }
}

function metricUv(p: RoofVertex, origin: RoofVertex, normal: THREE.Vector3): [number, number] {
  const rel = new THREE.Vector3(p.x - origin.x, p.h - origin.h, p.y - origin.y)
  const up = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(up, normal).normalize()
  if (u.lengthSq() < 1e-8) u.set(1, 0, 0)
  const v = new THREE.Vector3().crossVectors(normal, u).normalize()
  return [rel.dot(u), rel.dot(v)]
}

function edgeOutward(a: RoofVertex, b: RoofVertex, up: THREE.Vector3): THREE.Vector3 {
  const edge = new THREE.Vector3(b.x - a.x, b.h - a.h, b.y - a.y)
  const n = new THREE.Vector3().crossVectors(edge, up)
  if (n.lengthSq() < 1e-10) return new THREE.Vector3(0, 0, 1)
  return n.normalize()
}

function skylight(cut: Vec2[], model: RoofModel, y0: number, id: string): THREE.Group | null {
  if (cut.length < 3) return null
  const group = new THREE.Group()
  const glass = getMaterial({ id: 'glass' })
  const frameMat = getMaterial({ id: 'metal-black' })
  const samples = cut.map((p) => ({ x: p.x, y: p.y, h: heightOr(model, p) }))
  const pane = samples.map((p) => ({ x: p.x, y: p.y, h: p.h + 0.04 }))
  const geo = new THREE.BufferGeometry()
  const pos: number[] = []
  const uv: number[] = []
  for (const p of pane) {
    pos.push(p.x, y0 + p.h, p.y)
    uv.push(p.x, p.y)
  }
  const idx: number[] = []
  for (let i = 1; i < pane.length - 1; i++) idx.push(0, i, i + 1)
  if (idx.length === 0) return null
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, glass)
  mesh.userData.entityId = id
  mesh.userData.kind = 'roof'
  mesh.userData.roof = true
  group.add(mesh)
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i]
    const b = samples[(i + 1) % samples.length]
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 1e-3) continue
    const bar = new THREE.Mesh(metricUVs(new THREE.BoxGeometry(length, 0.06, 0.06)), frameMat)
    bar.position.set((a.x + b.x) / 2, y0 + (a.h + b.h) / 2 + 0.05, (a.y + b.y) / 2)
    const edge = new THREE.Vector3(b.x - a.x, b.h - a.h, b.y - a.y)
    if (edge.lengthSq() > 1e-8) {
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), edge.normalize())
    }
    bar.userData.entityId = id
    bar.userData.kind = 'roof'
    group.add(bar)
  }
  return group
}

function heightOr(model: RoofModel, p: Vec2): number {
  for (const face of model.faces) {
    if (face.kind === 'gable') continue
    if (pointInPolygon(p, face.ring)) return planeHeight(face.ring, p.x, p.y)
  }
  return 0
}

/** The roof plane's own UV frame (see metricUv), so trim lying on a slope continues its tiles. */
function planeBasis(origin: THREE.Vector3, normal: THREE.Vector3): UvBasis {
  const up = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(up, normal).normalize()
  if (u.lengthSq() < 1e-8) u.set(1, 0, 0)
  const v = new THREE.Vector3().crossVectors(normal, u).normalize()
  return { origin, u, v }
}
