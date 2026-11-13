import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import type { Column, Level } from '../model/types'

export function buildColumn(column: Column, level: Level): THREE.Group {
  const group = new THREE.Group()
  const size = Math.max(0.08, column.size || 0.3)
  const height = Math.max(0.2, level.height || 2.7)
  const geo = column.round
    ? new THREE.CylinderGeometry(size / 2, size / 2, height, 20)
    : new THREE.BoxGeometry(size, height, size)
  const mesh = new THREE.Mesh(geo, getMaterial(column.material))
  mesh.position.set(column.position.x, level.elevation + height / 2, column.position.y)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.entityId = column.id
  mesh.userData.kind = 'column'
  group.add(mesh)
  group.userData.entityId = column.id
  group.userData.kind = 'column'
  return group
}
