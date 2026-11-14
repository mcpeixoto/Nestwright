import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { dist } from '../model/geometry'
import type { Level, Wall } from '../model/types'
import { wallFrame } from '../model/walls'
import { metricUVs } from './uv'

/** Posts, a top rail, and glass infill when either face is the glass material. */
export function buildRailing(wall: Wall, level: Level): THREE.Group {
  const group = new THREE.Group()
  group.userData.entityId = wall.id
  group.userData.kind = 'wall'
  const frame = wallFrame(wall)
  if (frame.length < 0.05 || frame.points.length < 2) return group
  const height = Math.max(0.4, wall.height || 1)
  const postMat = getMaterial({ id: 'metal-black' })
  const railMat = getMaterial(wall.left?.id ? wall.left : { id: 'metal-black' })
  const glass = wall.left?.id === 'glass' || wall.right?.id === 'glass'
  const y0 = level.elevation
  const points = frame.points
  const spacing = 1.1
  const posts: THREE.Vector3[] = []
  let cursor = 0
  posts.push(postAt(points, 0, y0, height))
  while (cursor + spacing < frame.length - 0.05) {
    cursor += spacing
    posts.push(postAt(points, cursor / frame.length, y0, height))
  }
  posts.push(postAt(points, 1, y0, height))
  for (const base of posts) {
    const geo = metricUVs(new THREE.BoxGeometry(0.04, height, 0.04))
    const mesh = new THREE.Mesh(geo, postMat)
    mesh.position.set(base.x, y0 + height / 2, base.z)
    tag(mesh, wall.id)
    group.add(mesh)
  }
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]
    const b = posts[i + 1]
    if (!a || !b) continue
    group.add(railBetween(a, b, y0 + height - 0.03, railMat, wall.id))
    if (glass && dist({ x: a.x, y: a.z }, { x: b.x, y: b.z }) > 0.05) {
      group.add(glassBetween(a, b, y0 + 0.12, y0 + height - 0.08, wall.id))
    }
  }
  return group
}

function postAt(points: { x: number; y: number }[], t: number, y: number, height: number): THREE.Vector3 {
  const f = Math.min(points.length - 1, Math.max(0, t * (points.length - 1)))
  const i = Math.floor(f)
  const p = points[i] ?? points[0]!
  const q = points[Math.min(points.length - 1, i + 1)] ?? p
  const u = f - i
  return new THREE.Vector3(p.x + (q.x - p.x) * u, y + height, p.y + (q.y - p.y) * u)
}

function railBetween(a: THREE.Vector3, b: THREE.Vector3, y: number, material: THREE.Material, id: string): THREE.Mesh {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  const geo = metricUVs(new THREE.BoxGeometry(Math.max(length, 0.02), 0.04, 0.04))
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2)
  mesh.rotation.y = -Math.atan2(dz, dx)
  tag(mesh, id)
  return mesh
}

function glassBetween(a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number, id: string): THREE.Mesh {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.max(0.02, Math.hypot(dx, dz))
  const geo = metricUVs(new THREE.BoxGeometry(length, Math.max(0.05, y1 - y0), 0.012))
  const mesh = new THREE.Mesh(geo, getMaterial({ id: 'glass' }))
  mesh.position.set((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2)
  mesh.rotation.y = -Math.atan2(dz, dx)
  tag(mesh, id)
  return mesh
}

function tag(mesh: THREE.Mesh, id: string) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.entityId = id
  mesh.userData.kind = 'wall'
}
