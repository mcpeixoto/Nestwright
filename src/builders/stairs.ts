import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { dist, dot, normalize, perp, polygonArea, sub } from '../model/geometry'
import { computeStairSteps, type StairStep } from '../model/stairs'
import type { Level, Stair, Vec2 } from '../model/types'
import { metricUVs } from './uv'

const TREAD = 0.045

/** Treads, risers (open on a straight flight), side stringers, and an optional rail. */
export function buildStair(stair: Stair, level: Level): THREE.Group {
  const group = new THREE.Group()
  group.userData.entityId = stair.id
  group.userData.kind = 'stair'
  const layout = computeStairSteps(stair, level.height)
  if (layout.steps.length === 0) return group
  const material = getMaterial(stair.material)
  const metal = getMaterial({ id: 'metal-black' })
  const base = level.elevation
  layout.steps.forEach((step, index) => {
    const mesh = extrude(step.polygon, TREAD, material)
    if (!mesh) return
    placeTop(mesh.geometry, base + step.height)
    tag(mesh, stair.id)
    group.add(mesh)
    if (stair.shape !== 'straight') {
      const prev = index === 0 ? stair.position : centroid(layout.steps[index - 1]?.polygon ?? [])
      const edge = nearestEdge(step.polygon, prev)
      if (edge) group.add(riser(edge[0], edge[1], base + (index === 0 ? 0 : (layout.steps[index - 1]?.height ?? 0)), base + step.height, material, stair.id))
    }
  })
  for (const side of sideChains(layout.steps)) {
    group.add(stringer(side, base, material, stair.id))
  }
  if (stair.shape === 'spiral') {
    const column = new THREE.Mesh(metricUVs(new THREE.CylinderGeometry(0.15, 0.15, Math.max(0.2, layout.rise), 16)), material)
    column.position.set(stair.position.x, base + layout.rise / 2, stair.position.y)
    tag(column, stair.id)
    group.add(column)
  }
  if (stair.railing) {
    for (const side of sideChains(layout.steps)) addRail(group, side, base, metal, stair.id)
  }
  return group
}

function extrude(polygon: Vec2[], depth: number, material: THREE.Material): THREE.Mesh | null {
  const ring = polygon.map((p) => ({ x: p.x, y: p.y }))
  if (ring.length < 3) return null
  if (polygonArea(ring) < 0) ring.reverse()
  const first = ring[0]
  if (!first) return null
  const shape = new THREE.Shape()
  shape.moveTo(first.x, first.y)
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i]
    if (p) shape.lineTo(p.x, p.y)
  }
  shape.closePath()
  try {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth), bevelEnabled: false })
    geo.rotateX(Math.PI / 2)
    return new THREE.Mesh(geo, material)
  } catch {
    return null
  }
}

function placeTop(geo: THREE.BufferGeometry, topY: number) {
  geo.computeBoundingBox()
  const maxY = geo.boundingBox?.max.y ?? 0
  geo.translate(0, topY - maxY, 0)
}

/** Vertical board on a plan edge, both faces. UVs in metres: u along the edge, v up (world y). */
function riser(a: Vec2, b: Vec2, y0: number, y1: number, material: THREE.Material, id: string): THREE.Mesh {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const quads = new QuadBuilder()
  // Front then back, each with its own vertices so the two normals do not cancel.
  quads.quad(
    [a.x, y0, a.y, b.x, y0, b.y, b.x, y1, b.y, a.x, y1, a.y],
    [0, y0, length, y0, length, y1, 0, y1],
  )
  quads.quad(
    [a.x, y0, a.y, a.x, y1, a.y, b.x, y1, b.y, b.x, y0, b.y],
    [0, y0, 0, y1, length, y1, length, y0],
  )
  const mesh = new THREE.Mesh(quads.build(), material)
  tag(mesh, id)
  return mesh
}

/** Flat-shaded quads with their own vertices and metric UVs. */
class QuadBuilder {
  private pos: number[] = []
  private uv: number[] = []
  private index: number[] = []

  /** Four corners (x,y,z ×4) wound counter-clockwise seen from the front, and their UVs. */
  quad(corners: readonly number[], uvs: readonly number[]): void {
    const base = this.pos.length / 3
    this.pos.push(...corners)
    this.uv.push(...uvs)
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    geo.setIndex(this.index)
    geo.computeVertexNormals()
    return geo
  }
}

function stringer(chain: { x: number; y: number; h: number }[], base: number, material: THREE.Material, id: string): THREE.Group {
  const group = new THREE.Group()
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i]
    const b = chain[i + 1]
    if (!a || !b) continue
    const mesh = board(a, b, base, material, id)
    if (mesh) group.add(mesh)
  }
  return group
}

function board(
  a: { x: number; y: number; h: number },
  b: { x: number; y: number; h: number },
  base: number,
  material: THREE.Material,
  id: string,
): THREE.Mesh | null {
  const dx = b.x - a.x
  const dz = b.y - a.y
  const length = Math.hypot(dx, dz)
  if (length < 1e-3) return null
  const nx = -dz / length
  const nz = dx / length
  const w = 0.045
  const drop = 0.22
  const yA = base + a.h
  const yB = base + b.h
  // Corners 0–3 at a, 4–7 at b: +side top, −side top, −side bottom, +side bottom.
  const corner = (end: 0 | 1, side: 1 | -1, top: boolean): [number, number, number] => {
    const p = end === 0 ? a : b
    const y = (end === 0 ? yA : yB) - (top ? 0 : drop)
    return [p.x + nx * w * side, y, p.y + nz * w * side]
  }
  const c = [
    corner(0, 1, true), corner(0, -1, true), corner(0, -1, false), corner(0, 1, false),
    corner(1, 1, true), corner(1, -1, true), corner(1, -1, false), corner(1, 1, false),
  ]
  // Metres: u runs along the sloped board, v across it (width on top/bottom, depth on the sides).
  const along = Math.hypot(length, yB - yA)
  const u = (i: number) => (i < 4 ? 0 : along)
  const across = (i: number) => (i % 4 === 0 || i % 4 === 3 ? 0 : 2 * w)
  const depth = (i: number) => (i % 4 < 2 ? drop : 0)
  const quads = new QuadBuilder()
  const face = (ids: readonly [number, number, number, number], uvOf: (i: number) => [number, number]) => {
    quads.quad(
      ids.flatMap((i) => c[i] ?? [0, 0, 0]),
      ids.flatMap((i) => uvOf(i)),
    )
  }
  face([0, 1, 5, 4], (i) => [u(i), across(i)])
  face([1, 2, 6, 5], (i) => [u(i), depth(i)])
  face([2, 3, 7, 6], (i) => [u(i), across(i)])
  face([3, 0, 4, 7], (i) => [u(i), depth(i)])
  face([3, 2, 1, 0], (i) => [across(i), depth(i)])
  face([4, 5, 6, 7], (i) => [across(i), depth(i)])
  const geo = quads.build()
  const mesh = new THREE.Mesh(geo, material)
  tag(mesh, id)
  return mesh
}

function addRail(group: THREE.Group, chain: { x: number; y: number; h: number }[], base: number, material: THREE.Material, id: string) {
  const tops: THREE.Vector3[] = []
  for (const p of chain) {
    const post = new THREE.Mesh(metricUVs(new THREE.BoxGeometry(0.04, 0.9, 0.04)), material)
    post.position.set(p.x, base + p.h + 0.45, p.y)
    tag(post, id)
    group.add(post)
    tops.push(new THREE.Vector3(p.x, base + p.h + 0.9, p.y))
  }
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i]
    const b = tops[i + 1]
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const length = Math.hypot(dx, dy, dz)
    if (length < 1e-3) continue
    const rail = new THREE.Mesh(metricUVs(new THREE.BoxGeometry(length, 0.04, 0.04)), material)
    rail.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    rail.rotation.y = Math.atan2(dz, dx)
    rail.rotation.z = Math.atan2(dy, Math.hypot(dx, dz))
    tag(rail, id)
    group.add(rail)
  }
}

function sideChains(steps: StairStep[]): { x: number; y: number; h: number }[][] {
  const first = steps[0]?.polygon
  const a = first?.[0]
  const b = first?.[1]
  if (!a || !b) return []
  const across = perp(normalize(sub(b, a)))
  if (Math.hypot(across.x, across.y) < 1e-6) return []
  const left: { x: number; y: number; h: number }[] = []
  const right: { x: number; y: number; h: number }[] = []
  for (const step of steps) {
    let minS = Infinity
    let maxS = -Infinity
    let minP = step.polygon[0]
    let maxP = step.polygon[0]
    for (const p of step.polygon) {
      const s = dot(p, across)
      if (s < minS) {
        minS = s
        minP = p
      }
      if (s > maxS) {
        maxS = s
        maxP = p
      }
    }
    if (minP) left.push({ x: minP.x, y: minP.y, h: step.height })
    if (maxP) right.push({ x: maxP.x, y: maxP.y, h: step.height })
  }
  return [left, right].filter((chain) => chain.length >= 2)
}

function nearestEdge(poly: Vec2[], target: Vec2): [Vec2, Vec2] | null {
  let best: [Vec2, Vec2] | null = null
  let bestD = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const d = dist(mid, target)
    if (d < bestD) {
      bestD = d
      best = [a, b]
    }
  }
  return best
}

function centroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  return { x: x / poly.length, y: y / poly.length }
}

function tag(mesh: THREE.Mesh, id: string) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.entityId = id
  mesh.userData.kind = 'stair'
}
