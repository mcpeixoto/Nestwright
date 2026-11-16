import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildWall } from '../../src/builders/walls'
import { dot, normalize, perp, pointInPolygon, polygonCentroid, scale, sub } from '../../src/model/geometry'
import { getMaterial } from '../../src/materials/materialCache'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import { detectRooms } from '../../src/model/rooms'
import type { Level, Vec2, Wall } from '../../src/model/types'

/** Closed 6×4 m room, door on the south wall, window (sill 0.9 m) on the east wall. */
function house(): Level {
  const level = createLevel('Ground', 0.4)
  const south = createWall({ x: 0, y: 0 }, { x: 6, y: 0 })
  const east = createWall({ x: 6, y: 0 }, { x: 6, y: 4 })
  const north = createWall({ x: 6, y: 4 }, { x: 0, y: 4 })
  const west = createWall({ x: 0, y: 4 }, { x: 0, y: 0 })
  level.walls.push(south, east, north, west)
  level.openings.push(createOpening('door', south.id, 2), createOpening('window', east.id, 2, { sill: 0.9 }))
  return level
}

function plinths(group: THREE.Object3D): THREE.Mesh[] {
  return group.children.filter((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh && child.userData.trim === 'plinth')
}

function worldPoints(mesh: THREE.Mesh): THREE.Vector3[] {
  mesh.updateWorldMatrix(true, false)
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const out: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
  return out
}

/** Distance along the wall centre line from wall.a, in metres. Plan y is world z. */
function station(wall: Wall, p: THREE.Vector3): number {
  const dir = normalize(sub(wall.b, wall.a))
  return (p.x - wall.a.x) * dir.x + (p.z - wall.a.y) * dir.y
}

/** Unit plan vector pointing from the centre line toward the outside of the room. */
function outsideOf(wall: Wall, inside: Vec2): Vec2 {
  const left = perp(normalize(sub(wall.b, wall.a)))
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  return dot(left, sub(inside, mid)) >= 0 ? scale(left, -1) : left
}

/** Signed distance from the wall centre line toward `out`. */
function proudOf(wall: Wall, out: Vec2, p: THREE.Vector3): number {
  return (p.x - wall.a.x) * out.x + (p.z - wall.a.y) * out.y
}

/** True when some triangle crosses `at` metres along the wall. */
function crosses(mesh: THREE.Mesh, wall: Wall, at: number): boolean {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const index = mesh.geometry.getIndex()
  if (!index) return false
  mesh.updateWorldMatrix(true, false)
  const atIndex = (i: number) => station(wall, new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
  for (let k = 0; k < index.count; k += 3) {
    const ts = [atIndex(index.getX(k)), atIndex(index.getX(k + 1)), atIndex(index.getX(k + 2))]
    if (Math.min(...ts) < at && Math.max(...ts) > at) return true
  }
  return false
}

describe('exterior plinth', () => {
  it('adds one concrete plinth to each exterior wall on the ground storey only', () => {
    const level = house()
    for (const wall of level.walls) {
      const band = plinths(buildWall(wall, level, level.walls, { ground: true }))
      expect(band, wall.id).toHaveLength(1)
      expect(band[0]!.userData.entityId).toBe(wall.id)
      expect(band[0]!.userData.kind).toBe('wall')
      expect(band[0]!.material).toBe(getMaterial({ id: 'concrete' }))
      expect(plinths(buildWall(wall, level, level.walls, { ground: false })), wall.id).toHaveLength(0)
      expect(plinths(buildWall(wall, level, level.walls)), wall.id).toHaveLength(0)
    }
  })

  it('is a 0.35 m band on the outside face, standing out at most 30 mm', () => {
    const level = house()
    const room = detectRooms(level)[0]!
    const inside = polygonCentroid(room.polygon)
    for (const wall of level.walls) {
      const band = plinths(buildWall(wall, level, level.walls, { ground: true }))
      expect(band, wall.id).toHaveLength(1)
      const mesh = band[0]!
      const box = new THREE.Box3().setFromObject(mesh)
      expect(box.min.y).toBeGreaterThanOrEqual(level.elevation - 0.01)
      expect(box.min.y).toBeLessThanOrEqual(level.elevation + 0.01)
      expect(box.max.y).toBeGreaterThanOrEqual(level.elevation + 0.35 - 0.01)
      expect(box.max.y).toBeLessThanOrEqual(level.elevation + 0.35 + 0.01)
      const out = outsideOf(wall, inside)
      for (const p of worldPoints(mesh)) {
        expect(pointInPolygon({ x: p.x, y: p.z }, room.polygon)).toBe(false)
        const dist = proudOf(wall, out, p)
        expect(dist).toBeGreaterThanOrEqual(wall.thickness / 2 - 1e-3)
        expect(dist).toBeLessThanOrEqual(wall.thickness / 2 + 0.03)
      }
    }
  })

  it('leaves a gap in the door and runs straight through the window', () => {
    const level = house()
    const south = level.walls[0]!
    const east = level.walls[1]!
    const door = level.openings[0]!
    const window = level.openings[1]!
    const doorBands = plinths(buildWall(south, level, level.walls, { ground: true }))
    expect(doorBands).toHaveLength(1)
    const doorBand = doorBands[0]!
    const doorStart = door.offset - door.width / 2
    const doorEnd = door.offset + door.width / 2
    for (const p of worldPoints(doorBand)) {
      const t = station(south, p)
      expect(t > doorStart + 1e-3 && t < doorEnd - 1e-3).toBe(false)
    }
    expect(crosses(doorBand, south, door.offset)).toBe(false)
    expect(crosses(doorBand, south, 0.4)).toBe(true)

    const windowBands = plinths(buildWall(east, level, level.walls, { ground: true }))
    expect(windowBands).toHaveLength(1)
    const windowBand = windowBands[0]!
    expect(crosses(windowBand, east, window.offset)).toBe(true)
  })

  it('does not run along an interior partition', () => {
    const level = house()
    const partition = createWall({ x: 3, y: 0 }, { x: 3, y: 4 })
    level.walls.push(partition)
    expect(detectRooms(level)).toHaveLength(2)
    expect(plinths(buildWall(level.walls[0]!, level, level.walls, { ground: true }))).toHaveLength(1)
    expect(plinths(buildWall(partition, level, level.walls, { ground: true }))).toHaveLength(0)
  })

  it('does not run along a railing', () => {
    const level = house()
    expect(plinths(buildWall(level.walls[0]!, level, level.walls, { ground: true }))).toHaveLength(1)
    const railing = createWall({ x: 0, y: -2 }, { x: 4, y: -2 }, { kind: 'railing', height: 1.05 })
    level.walls.push(railing)
    expect(plinths(buildWall(railing, level, level.walls, { ground: true }))).toHaveLength(0)
  })
})
