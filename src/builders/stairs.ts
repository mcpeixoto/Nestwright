import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { dist, dot, normalize, perp, polygonArea, sub } from '../model/geometry'
import { computeStairSteps, type StairStep } from '../model/stairs'
import type { Level, Stair, Vec2 } from '../model/types'

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
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, Math.max(0.2, layout.rise), 16), material)
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

function riser(a: Vec2, b: Vec2, y0: number, y1: number, material: THREE.Material, id: string): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  const positions = [a.x, y0, a.y, b.x, y0, b.y, b.x, y1, b.y, a.x, y1, a.y]
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2])
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  tag(mesh, id)
  return mesh
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
  const verts = [
    a.x + nx * w, yA, a.y + nz * w,
    a.x - nx * w, yA, a.y - nz * w,
    a.x - nx * w, yA - drop, a.y - nz * w,
    a.x + nx * w, yA - drop, a.y + nz * w,
    b.x + nx * w, yB, b.y + nz * w,
    b.x - nx * w, yB, b.y - nz * w,
    b.x - nx * w, yB - drop, b.y - nz * w,
    b.x + nx * w, yB - drop, b.y + nz * w,
  ]
  const idx = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 3, 2, 1, 3, 1, 0, 4, 5, 6, 4, 6, 7]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  tag(mesh, id)
  return mesh
}

function addRail(group: THREE.Group, chain: { x: number; y: number; h: number }[], base: number, material: THREE.Material, id: string) {
  const tops: THREE.Vector3[] = []
  for (const p of chain) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.04), material)
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
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, 0.04), material)
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
