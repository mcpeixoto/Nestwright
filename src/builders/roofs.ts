import earcut from 'earcut'
import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { pointInPolygon, polygonArea } from '../model/geometry'
import { clipToConvex, isConvex } from '../model/polygon'
import { buildRoofModel, type RoofFace, type RoofModel, type RoofVertex } from '../model/roofs'
import type { Level, Roof, Vec2 } from '../model/types'
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
  return group
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
