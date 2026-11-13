import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { pointInPolygon, polygonArea } from '../model/geometry'
import { clipToConvex, isConvex, offsetPolygon } from '../model/polygon'
import { outerOutline } from '../model/roofs'
import type { Level, Room, Vec2 } from '../model/types'

export interface FloorOptions {
  /** Stair openings from the level below, in plan coordinates. */
  holes?: readonly (readonly Vec2[])[]
  /** Upper storeys get a rim out to the wall's outer face. */
  upper?: boolean
  /** A roof on this level replaces the flat ceiling. */
  skipCeiling?: boolean
}

function shapeFrom(ring: readonly Vec2[], holes: readonly (readonly Vec2[])[]): THREE.Shape | null {
  if (ring.length < 3) return null
  const outer = polygonArea(ring) < 0 ? [...ring].reverse() : ring.map((p) => ({ x: p.x, y: p.y }))
  const first = outer[0]
  if (!first) return null
  const shape = new THREE.Shape()
  shape.moveTo(first.x, first.y)
  for (let i = 1; i < outer.length; i++) {
    const p = outer[i]
    if (p) shape.lineTo(p.x, p.y)
  }
  shape.closePath()
  for (const hole of holes) {
    const clipped = clipHole(outer, hole)
    if (!clipped || clipped.length < 3) continue
    const cw = polygonArea(clipped) > 0 ? [...clipped].reverse() : clipped
    const path = new THREE.Path()
    const start = cw[0]
    if (!start) continue
    path.moveTo(start.x, start.y)
    for (let i = 1; i < cw.length; i++) {
      const p = cw[i]
      if (p) path.lineTo(p.x, p.y)
    }
    path.closePath()
    shape.holes.push(path)
  }
  return shape
}

function clipHole(room: readonly Vec2[], hole: readonly Vec2[]): Vec2[] | null {
  if (hole.length < 3) return null
  const copy = hole.map((p) => ({ x: p.x, y: p.y }))
  if (copy.every((p) => pointInPolygon(p, room))) return copy
  if (!isConvex(room)) return null
  const clipped = clipToConvex(copy, room)
  return clipped.length >= 3 ? clipped : null
}

function slabGeometry(room: Room, depth: number, holes: readonly (readonly Vec2[])[]): THREE.BufferGeometry | null {
  const shape = shapeFrom(room.polygon, holes)
  if (!shape) return null
  // ShapeGeometry/ExtrudeGeometry triangulate with earcut. Shape lives in XY;
  // rotateX(+90°) maps plan y onto world z without mirroring.
  try {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    geo.rotateX(Math.PI / 2)
    return geo
  } catch {
    return null
  }
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
export function buildFloors(level: Level, rooms: readonly Room[], options: FloorOptions = {}): THREE.Group {
  const group = new THREE.Group()
  const holes = options.holes ?? []
  for (const room of rooms) {
    const floorGeo = slabGeometry(room, Math.max(0.02, level.slabThickness), holes)
    if (!floorGeo) continue
    placeTop(floorGeo, level.elevation)
    const floor = new THREE.Mesh(floorGeo, getMaterial(room.floor))
    floor.receiveShadow = true
    floor.userData.entityId = room.key
    floor.userData.kind = 'room'
    group.add(floor)

    if (room.noCeiling || options.skipCeiling) continue
    const ceilGeo = slabGeometry(room, 0.08, [])
    if (!ceilGeo) continue
    placeBottom(ceilGeo, level.elevation + level.height)
    const ceiling = new THREE.Mesh(ceilGeo, getMaterial(room.ceiling))
    ceiling.receiveShadow = true
    ceiling.userData.entityId = room.key
    ceiling.userData.kind = 'room'
    ceiling.userData.ceiling = true
    group.add(ceiling)
  }
  if (options.upper) {
    const edge = buildOuterEdge(level)
    if (edge) group.add(edge)
  }
  return group
}

/** The band between the room centre-lines and the outer wall face, so an upper floor reads as solid. */
function buildOuterEdge(level: Level): THREE.Mesh | null {
  const outer = outerOutline(level)
  if (outer.length < 3) return null
  let thickness = 0.2
  for (const wall of level.walls) {
    if (wall.kind === 'railing') continue
    thickness = Math.max(thickness, wall.thickness)
  }
  const inner = offsetPolygon(outer, thickness / 2 + 0.01)
  if (inner.length < 3 || polygonArea(inner) <= 0) return null
  const shape = shapeFrom(outer, [inner])
  if (!shape) return null
  let geo: THREE.BufferGeometry
  try {
    geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.02, level.slabThickness), bevelEnabled: false })
  } catch {
    return null
  }
  geo.rotateX(Math.PI / 2)
  placeTop(geo, level.elevation - 0.004)
  const mesh = new THREE.Mesh(geo, getMaterial({ id: 'concrete' }))
  mesh.receiveShadow = true
  mesh.userData.kind = 'slab'
  return mesh
}
