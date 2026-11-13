import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import type { Level, Room } from '../model/types'

function slabGeometry(room: Room, depth: number): THREE.BufferGeometry | null {
  if (room.polygon.length < 3) return null
  const shape = new THREE.Shape()
  const first = room.polygon[0]
  if (!first) return null
  shape.moveTo(first.x, first.y)
  for (let i = 1; i < room.polygon.length; i++) {
    const p = room.polygon[i]
    if (p) shape.lineTo(p.x, p.y)
  }
  shape.closePath()
  // ShapeGeometry/ExtrudeGeometry triangulate with earcut. Shape lives in XY;
  // rotateX(+90°) maps plan y onto world z without mirroring.
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geo.rotateX(Math.PI / 2)
  return geo
}

function placeTop(geo: THREE.BufferGeometry, topY: number) {
  geo.computeBoundingBox()
  const maxY = geo.boundingBox?.max.y ?? 0
  geo.translate(0, topY - maxY, 0)
}

function placeBottom(geo: THREE.BufferGeometry, bottomY: number) {
  geo.computeBoundingBox()
  const minY = geo.boundingBox?.min.y ?? 0
  geo.translate(0, bottomY - minY, 0)
}

/** Floor slab per room, top flush with the level elevation, plus a ceiling unless `noCeiling`. */
export function buildFloors(level: Level, rooms: readonly Room[]): THREE.Group {
  const group = new THREE.Group()
  for (const room of rooms) {
    const floorGeo = slabGeometry(room, Math.max(0.02, level.slabThickness))
    if (!floorGeo) continue
    placeTop(floorGeo, level.elevation)
    const floor = new THREE.Mesh(floorGeo, getMaterial(room.floor))
    floor.receiveShadow = true
    floor.userData.entityId = room.key
    floor.userData.kind = 'room'
    group.add(floor)

    if (room.noCeiling) continue
    const ceilGeo = slabGeometry(room, 0.08)
    if (!ceilGeo) continue
    placeBottom(ceilGeo, level.elevation + level.height)
    const ceiling = new THREE.Mesh(ceilGeo, getMaterial(room.ceiling))
    ceiling.receiveShadow = true
    ceiling.userData.entityId = room.key
    ceiling.userData.kind = 'room'
    ceiling.userData.ceiling = true
    group.add(ceiling)
  }
  return group
}
