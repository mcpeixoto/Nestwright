import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildColumn } from '../../src/builders/columns'
import { buildFloors } from '../../src/builders/floors'
import { buildRoof } from '../../src/builders/roofs'
import { buildSlab } from '../../src/builders/slabs'
import { buildStair } from '../../src/builders/stairs'
import { buildWall } from '../../src/builders/walls'
import { createLevel, createWall } from '../../src/model/defaults'
import { pointInPolygon, polygonCentroid } from '../../src/model/geometry'
import { detectRooms } from '../../src/model/rooms'
import { stairHoleOutline } from '../../src/model/stairs'
import type { Column, Level, Roof, Slab, Stair, Vec2 } from '../../src/model/types'

function square(size = 4): Level {
  const level = createLevel('Ground', 0)
  level.walls.push(
    createWall({ x: 0, y: 0 }, { x: size, y: 0 }),
    createWall({ x: size, y: 0 }, { x: size, y: size }),
    createWall({ x: size, y: size }, { x: 0, y: size }),
    createWall({ x: 0, y: size }, { x: 0, y: 0 }),
  )
  return level
}

function stairAt(position: Vec2): Stair {
  return {
    id: 'stair_test',
    shape: 'straight',
    position,
    rotation: 0,
    width: 0.9,
    rise: 2.7,
    turnLeft: true,
    material: { id: 'oak-planks' },
    railing: true,
  }
}

describe('structure builders', () => {
  it('builds a stair, column, slab, railing and roof without throwing', () => {
    const level = square()
    const stair = buildStair(stairAt({ x: 1, y: 2 }), level)
    stair.updateMatrixWorld(true)
    const stairBox = new THREE.Box3().setFromObject(stair)
    expect(stairBox.max.y).toBeGreaterThan(2)
    expect(stairBox.min.y).toBeLessThan(0.2)

    const column: Column = { id: 'col', position: { x: 1, y: 1 }, size: 0.3, round: true, material: { id: 'concrete' } }
    const columnObj = buildColumn(column, level)
    columnObj.updateMatrixWorld(true)
    expect(new THREE.Box3().setFromObject(columnObj).max.y).toBeGreaterThan(2)

    const slab: Slab = {
      id: 'slab',
      polygon: [
        { x: 5, y: 0 },
        { x: 7, y: 0 },
        { x: 7, y: 2 },
        { x: 5, y: 2 },
      ],
      thickness: 0.18,
      top: 0,
      material: { id: 'concrete' },
    }
    const slabObj = buildSlab(slab, level)
    slabObj.updateMatrixWorld(true)
    const slabBox = new THREE.Box3().setFromObject(slabObj)
    expect(slabBox.max.y).toBeCloseTo(0, 2)
    expect(slabBox.max.x).toBeGreaterThan(6)

    const rail = createWall({ x: 0, y: 0 }, { x: 3, y: 0 }, { kind: 'railing', height: 1, thickness: 0.08 })
    const railObj = buildWall(rail, level, [])
    railObj.updateMatrixWorld(true)
    expect(railObj.children.length).toBeGreaterThan(0)
    expect(new THREE.Box3().setFromObject(railObj).max.y).toBeGreaterThan(0.8)

    const roof: Roof = {
      id: 'roof',
      shape: 'gable',
      outline: [
        { x: -0.1, y: -0.1 },
        { x: 4.1, y: -0.1 },
        { x: 4.1, y: 4.1 },
        { x: -0.1, y: 4.1 },
      ],
      pitch: Math.PI / 6,
      overhang: 0.3,
      ridgeAngle: 0,
      thickness: 0.08,
      material: { id: 'roof-tiles' },
      cutouts: [
        [
          { x: 1.5, y: 1.6 },
          { x: 2.5, y: 1.6 },
          { x: 2.5, y: 2.4 },
          { x: 1.5, y: 2.4 },
        ],
      ],
    }
    const roofObj = buildRoof(roof, level)
    roofObj.updateMatrixWorld(true)
    const roofBox = new THREE.Box3().setFromObject(roofObj)
    expect(roofBox.max.y).toBeGreaterThan(level.height + 0.2)
    expect(roofObj.children.length).toBeGreaterThan(0)
  })

  it('returns empty groups for unusable input', () => {
    const level = createLevel('Empty', 0)
    expect(buildStair({ ...stairAt({ x: 0, y: 0 }), width: 0 }, level).children.length).toBeGreaterThan(0)
    const emptyRoof: Roof = {
      id: 'empty',
      shape: 'hip',
      outline: [],
      pitch: 0.5,
      overhang: 0.2,
      ridgeAngle: 0,
      thickness: 0.08,
      material: { id: 'missing-material' },
      cutouts: [],
    }
    expect(() => buildRoof(emptyRoof, level)).not.toThrow()
    expect(buildRoof(emptyRoof, level).children.length).toBe(0)
    expect(() => buildSlab({ id: 's', polygon: [{ x: 0, y: 0 }], thickness: 0.1, top: 0, material: { id: 'nope' } }, level)).not.toThrow()
    expect(() => buildColumn({ id: 'c', position: { x: 0, y: 0 }, size: 0, round: false, material: { id: 'nope' } }, level)).not.toThrow()
    expect(() => buildWall(createWall({ x: 0, y: 0 }, { x: 0, y: 0 }, { kind: 'railing' }), level, [])).not.toThrow()
  })

  it('cuts a stair hole in the floor above and extends the upper slab past the walls', () => {
    const lower = square(8)
    const upper = square(8)
    upper.elevation = 2.7
    const stair = stairAt({ x: 1.2, y: 4 })
    const hole = stairHoleOutline(stair)
    const rooms = detectRooms(upper)
    const group = buildFloors(upper, rooms, { holes: [hole], upper: true })
    group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(group)
    expect(box.max.x).toBeGreaterThan(8.05)
    expect(box.min.x).toBeLessThan(-0.05)

    const sample = polygonCentroid(hole)
    expect(pointInPolygon(sample, rooms[0]?.polygon ?? [])).toBe(true)
    const throughHole = new THREE.Raycaster(new THREE.Vector3(sample.x, upper.elevation + 1, sample.y), new THREE.Vector3(0, -1, 0))
    const floors = group.children.filter((child) => child.userData.kind === 'room' && !child.userData.ceiling)
    expect(throughHole.intersectObjects(floors, true)).toHaveLength(0)

    const solid = new THREE.Raycaster(new THREE.Vector3(0.3, upper.elevation + 1, 0.3), new THREE.Vector3(0, -1, 0))
    expect(solid.intersectObjects(floors, true).length).toBeGreaterThan(0)

    const ground = buildFloors(lower, detectRooms(lower))
    ground.updateMatrixWorld(true)
    const groundBox = new THREE.Box3().setFromObject(ground)
    expect(groundBox.max.x).toBeLessThan(8.05)
    expect(groundBox.min.x).toBeGreaterThan(-0.05)
  })
})
