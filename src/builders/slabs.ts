import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { polygonArea } from '../model/geometry'
import type { Level, Slab, Vec2 } from '../model/types'
import { edgeStrip, Sheet } from './trim'

export function buildSlab(slab: Slab, level: Level): THREE.Group {
  const group = new THREE.Group()
  const ring = oriented(slab.polygon)
  if (ring.length < 3) return group
  const thickness = Math.max(0.02, slab.thickness || 0.18)
  const shape = shapeOf(ring)
  if (!shape) return group
  let geo: THREE.BufferGeometry
  try {
    geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
  } catch {
    return group
  }
  geo.rotateX(Math.PI / 2)
  geo.computeBoundingBox()
  const maxY = geo.boundingBox?.max.y ?? 0
  const top = level.elevation + (Number.isFinite(slab.top) ? slab.top : 0)
  geo.translate(0, top - maxY, 0)
  const mesh = new THREE.Mesh(geo, getMaterial(slab.material))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.entityId = slab.id
  mesh.userData.kind = 'slab'
  group.add(mesh)
  // Bevel strips along the exposed top edge, so a terrace or step never ends in a knife edge.
  const edges = new Sheet()
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const dx = b.x - a.x
    const dz = b.y - a.y
    const length = Math.hypot(dx, dz)
    if (length < 1e-3) continue
    // Counter-clockwise ring: outward is to the right of a→b.
    const out = new THREE.Vector3(dz / length, 0, -dx / length)
    edgeStrip(edges, new THREE.Vector3(a.x, top, a.y), new THREE.Vector3(b.x, top, b.y), out, up, 0.008)
  }
  const bevel = edges.mesh(mesh.material as THREE.Material)
  if (bevel) {
    bevel.userData.entityId = slab.id
    bevel.userData.kind = 'slab'
    group.add(bevel)
  }
  group.userData.entityId = slab.id
  group.userData.kind = 'slab'
  return group
}

function oriented(poly: readonly Vec2[]): Vec2[] {
  if (poly.length < 3) return []
  const ring = poly.map((p) => ({ x: p.x, y: p.y }))
  if (polygonArea(ring) < 0) ring.reverse()
  return ring
}

function shapeOf(ring: Vec2[]): THREE.Shape | null {
  const first = ring[0]
  if (!first) return null
  const shape = new THREE.Shape()
  shape.moveTo(first.x, first.y)
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i]
    if (p) shape.lineTo(p.x, p.y)
  }
  shape.closePath()
  return shape
}
