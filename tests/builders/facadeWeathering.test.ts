import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildWall } from '../../src/builders/walls'
import { EAVE_DRIP, FACADE_ATTRIBUTE, NO_SPLASH, SILL_DRIP, attachFacadeWeathering } from '../../src/materials/facadeWeathering'
import { getMaterial, isOutdoorMaterial, materialCacheKey, outdoorVariant, facadeVariant } from '../../src/materials/materialCache'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import { detectRooms } from '../../src/model/rooms'
import type { Level } from '../../src/model/types'
import { attachWeather, dressOutdoorMesh, isOutdoorMesh } from '../../src/view3d/atmosphere/weather'

type WithNodes = THREE.MeshStandardMaterial & { colorNode?: unknown }

/** Closed 6×4 m room at elevation 0.4, window (sill 0.9 m) on the east wall. */
function house(): Level {
  const level = createLevel('Ground', 0.4)
  const south = createWall({ x: 0, y: 0 }, { x: 6, y: 0 })
  const east = createWall({ x: 6, y: 0 }, { x: 6, y: 4 })
  const north = createWall({ x: 6, y: 4 }, { x: 0, y: 4 })
  const west = createWall({ x: 0, y: 4 }, { x: 0, y: 0 })
  level.walls.push(south, east, north, west)
  level.openings.push(createOpening('window', east.id, 2, { sill: 0.9 }))
  return level
}

function faces(group: THREE.Object3D): THREE.Mesh[] {
  return group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh && typeof c.userData.face === 'string')
}

function weatherRows(mesh: THREE.Mesh): [number, number, number][] {
  const attr = mesh.geometry.getAttribute(FACADE_ATTRIBUTE) as THREE.BufferAttribute
  const rows: [number, number, number][] = []
  for (let i = 0; i < attr.count; i++) rows.push([attr.getX(i), attr.getY(i), attr.getZ(i)])
  return rows
}

function maxY(mesh: THREE.Mesh): number {
  mesh.geometry.computeBoundingBox()
  return mesh.geometry.boundingBox!.max.y
}

describe('facade material twin', () => {
  it('keys the facade twin as an outdoor twin of its own', () => {
    expect(materialCacheKey({ id: 'brick-red' }, { facade: true })).toBe('brick-red||1|facade|outdoor')
    const indoor = getMaterial({ id: 'brick-red' })
    const outdoor = getMaterial({ id: 'brick-red' }, { outdoor: true })
    const facade = getMaterial({ id: 'brick-red' }, { facade: true })
    expect(facade).not.toBe(indoor)
    expect(facade).not.toBe(outdoor)
    expect(getMaterial({ id: 'brick-red' }, { facade: true })).toBe(facade)
    expect(facadeVariant(indoor)).toBe(facade)
    expect(facadeVariant(outdoor)).toBe(facade)
    expect(facadeVariant(facade)).toBe(facade)
    // The weather dresser must keep it, not make a twin of the twin.
    expect(outdoorVariant(facade)).toBe(facade)
    expect(isOutdoorMaterial(facade)).toBe(true)
    expect(facade.map).toBe(indoor.map)
  })

  it('weathers only the facade twin', () => {
    const indoor = getMaterial({ id: 'plaster-white' }) as WithNodes
    const outdoor = getMaterial({ id: 'plaster-white' }, { outdoor: true }) as WithNodes
    const facade = getMaterial({ id: 'plaster-white' }, { facade: true }) as WithNodes
    expect(facade.colorNode).toBeTruthy()
    expect(facade.userData.facade).toBe(true)
    expect(indoor.colorNode ?? null).toBeNull()
    expect(outdoor.userData.facade).toBeUndefined()
  })

  it('attaches once and wraps the weather on top', () => {
    const facade = getMaterial({ id: 'render-stucco' }, { facade: true }) as WithNodes
    const weathered = facade.colorNode
    attachFacadeWeathering(facade)
    expect(facade.colorNode).toBe(weathered)
    attachWeather(facade)
    expect(facade.colorNode).not.toBe(weathered)
  })

  it('leaves glass clean', () => {
    const glass = new THREE.MeshStandardMaterial({ transparent: true }) as WithNodes
    attachFacadeWeathering(glass)
    expect(glass.colorNode ?? null).toBeNull()
  })
})

describe('exterior wall faces', () => {
  const level = house()
  const rooms = detectRooms(level)
  const [south, east] = level.walls

  it('splits each wall into a dry indoor face and a weathered outdoor face', () => {
    const group = buildWall(south!, level, level.walls, { rooms, ground: true })
    const parts = faces(group)
    const outdoor = parts.filter((m) => m.userData.outdoor === true)
    const indoor = parts.filter((m) => m.userData.face !== 'end' && m.userData.outdoor !== true)
    expect(outdoor).toHaveLength(1)
    expect(indoor).toHaveLength(1)
    expect(isOutdoorMesh(outdoor[0]!)).toBe(true)
    expect((outdoor[0]!.material as THREE.Material).userData.facade).toBe(true)
    expect(indoor[0]!.geometry.getAttribute(FACADE_ATTRIBUTE)).toBeUndefined()
    expect(isOutdoorMaterial(indoor[0]!.material as THREE.Material)).toBe(false)
    const attr = outdoor[0]!.geometry.getAttribute(FACADE_ATTRIBUTE)
    expect(attr.count).toBe(outdoor[0]!.geometry.getAttribute('position').count)
  })

  it('keeps the weather dresser from swapping the facade back to a plain twin', () => {
    const group = buildWall(south!, level, level.walls, { rooms, ground: true })
    const mesh = faces(group).find((m) => m.userData.outdoor === true)!
    const before = mesh.material
    dressOutdoorMesh(mesh)
    expect(mesh.material).toBe(before)
  })

  it('drips from the sill under a window and from the eaves on the top storey', () => {
    const group = buildWall(east!, level, level.walls, { rooms, ground: true })
    const mesh = faces(group).find((m) => m.userData.outdoor === true)!
    const rows = weatherRows(mesh)
    const sills = rows.filter((r) => r[1] === SILL_DRIP)
    expect(sills.length).toBeGreaterThan(0)
    for (const r of sills) expect(r[0]).toBeCloseTo(0.4 + 0.9, 5)
    const eaves = rows.filter((r) => Math.abs(r[1] - EAVE_DRIP) < 1e-6)
    expect(eaves.length).toBeGreaterThan(0)
    for (const r of eaves) expect(r[0]).toBeCloseTo(maxY(mesh), 5)
    // Ground floor: splash rises from the level's own floor.
    for (const r of rows) expect(r[2]).toBeCloseTo(0.4, 5)
  })

  it('has no eave streaks under another storey and no splash above the ground floor', () => {
    const group = buildWall(east!, level, level.walls, { rooms, ground: false, above: { rooms: [], slab: 0.2 } })
    const rows = weatherRows(faces(group).find((m) => m.userData.outdoor === true)!)
    expect(rows.some((r) => Math.abs(r[1] - EAVE_DRIP) < 1e-6)).toBe(false)
    expect(rows.some((r) => r[1] === SILL_DRIP)).toBe(true)
    for (const r of rows) expect(r[2]).toBe(NO_SPLASH)
  })

  it('keeps a wall between two rooms entirely indoors', () => {
    const lvl = house()
    const mid = createWall({ x: 3, y: 0 }, { x: 3, y: 4 })
    lvl.walls.push(mid)
    const group = buildWall(mid, lvl, lvl.walls, { rooms: detectRooms(lvl), ground: true })
    expect(faces(group).some((m) => m.userData.outdoor === true)).toBe(false)
  })
})
