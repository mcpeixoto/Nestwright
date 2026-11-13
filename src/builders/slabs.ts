import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { polygonArea } from '../model/geometry'
import type { Level, Slab, Vec2 } from '../model/types'

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
