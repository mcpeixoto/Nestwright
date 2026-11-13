import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildFloors } from '../../src/builders/floors'
import { buildWall } from '../../src/builders/walls'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import { detectRooms } from '../../src/model/rooms'

describe('buildWall', () => {
  it('cuts a door hole: the bbox is the wall, and a ray through the door hits nothing', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, { height: 2.7, thickness: 0.2 })
    const door = createOpening('door', wall.id, 2)
    const level = createLevel('Ground', 0)
    level.walls = [wall]
    level.openings = [door]
    const obj = buildWall(wall, level, [])
    obj.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(obj)
    expect(box.min.x).toBeLessThan(0.02)
    expect(box.max.x).toBeGreaterThan(3.98)
    expect(box.min.y).toBeCloseTo(0, 2)
    expect(box.max.y).toBeCloseTo(2.7, 2)
    expect(box.min.z).toBeLessThan(-0.05)
    expect(box.max.z).toBeGreaterThan(0.05)

    const throughDoor = new THREE.Raycaster(new THREE.Vector3(2, 1, 3), new THREE.Vector3(0, 0, -1))
    expect(throughDoor.intersectObject(obj, true)).toHaveLength(0)

    const throughSolid = new THREE.Raycaster(new THREE.Vector3(0.4, 1, 3), new THREE.Vector3(0, 0, -1))
    expect(throughSolid.intersectObject(obj, true).length).toBeGreaterThan(0)
  })

  it('lays a floor slab on the detected room, top at the level elevation', () => {
    const level = createLevel('Ground', 0)
    level.walls.push(
      createWall({ x: 0, y: 0 }, { x: 4, y: 0 }),
      createWall({ x: 4, y: 0 }, { x: 4, y: 4 }),
      createWall({ x: 4, y: 4 }, { x: 0, y: 4 }),
      createWall({ x: 0, y: 4 }, { x: 0, y: 0 }),
    )
    const group = buildFloors(level, detectRooms(level))
    group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(group)
    expect(box.max.y).toBeGreaterThan(level.height - 0.01)
    expect(box.min.x).toBeCloseTo(0, 1)
    expect(box.max.x).toBeCloseTo(4, 1)
    expect(box.min.z).toBeCloseTo(0, 1)
    expect(box.max.z).toBeCloseTo(4, 1)
  })
})
