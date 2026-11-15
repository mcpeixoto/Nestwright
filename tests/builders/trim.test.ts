import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildOpening } from '../../src/builders/openings'
import { buildRoof } from '../../src/builders/roofs'
import { buildSlab } from '../../src/builders/slabs'
import { chamferBox, Sheet, sweep, vec3 } from '../../src/builders/trim'
import { buildWall } from '../../src/builders/walls'
import { createLevel, createOpening, createWall } from '../../src/model/defaults'
import { detectRooms } from '../../src/model/rooms'
import { openingTrim, resolveTrim, roomBeside, SKIRTING } from '../../src/model/trim'
import type { Level, Roof } from '../../src/model/types'
import { TEMPLATES } from '../../src/templates'

function box4(): Level {
  const level = createLevel('Ground', 0)
  level.walls.push(
    createWall({ x: 0, y: 0 }, { x: 4, y: 0 }),
    createWall({ x: 4, y: 0 }, { x: 4, y: 4 }),
    createWall({ x: 4, y: 4 }, { x: 0, y: 4 }),
    createWall({ x: 0, y: 4 }, { x: 0, y: 0 }),
  )
  return level
}

function trimMeshes(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh && mesh.userData.trim === name) out.push(mesh)
  })
  return out
}

function worldBox(meshes: THREE.Mesh[]): THREE.Box3 {
  const box = new THREE.Box3()
  for (const mesh of meshes) box.expandByObject(mesh)
  return box
}

/** Every triangle edge as long in uv as in the world. */
function worstUvError(mesh: THREE.Mesh): number {
  mesh.updateWorldMatrix(true, false)
  const geo = mesh.geometry
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  const index = geo.getIndex()!
  let worst = 0
  for (let k = 0; k < index.count; k += 3) {
    const ids = [index.getX(k), index.getX(k + 1), index.getX(k + 2)]
    const p = ids.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
    const t = ids.map((i) => new THREE.Vector2().fromBufferAttribute(uv, i))
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3
      worst = Math.max(worst, Math.abs(p[i]!.distanceTo(p[j]!) - t[i]!.distanceTo(t[j]!)))
    }
  }
  return worst
}

/** Normals agree with the triangle winding (front faces face out). */
function windingAgrees(mesh: THREE.Mesh): boolean {
  const geo = mesh.geometry
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const norm = geo.getAttribute('normal') as THREE.BufferAttribute
  const index = geo.getIndex()!
  for (let k = 0; k < index.count; k += 3) {
    const [a, b, c] = [index.getX(k), index.getX(k + 1), index.getX(k + 2)].map((i) => new THREE.Vector3().fromBufferAttribute(pos, i))
    const n = new THREE.Vector3().crossVectors(b!.clone().sub(a!), c!.clone().sub(a!))
    if (n.lengthSq() < 1e-14) continue
    const stored = new THREE.Vector3().fromBufferAttribute(norm, index.getX(k))
    if (n.dot(stored) <= 0) return false
  }
  return true
}

describe('interior trim', () => {
  it('defaults to skirting and a shadow gap; the level can turn them off or pick a cove', () => {
    expect(resolveTrim(undefined)).toEqual({ skirting: true, ceiling: 'shadow-gap' })
    expect(resolveTrim({ ceiling: 'cove' })).toEqual({ skirting: true, ceiling: 'cove' })
    const level = box4()
    level.trim = { skirting: false, ceiling: 'none' }
    const wall = level.walls[0]!
    const group = buildWall(wall, level, level.walls)
    expect(trimMeshes(group, 'skirting')).toHaveLength(0)
    expect(trimMeshes(group, 'shadow-gap')).toHaveLength(0)
  })

  it('runs skirting along the room side only, 80 mm tall, and selecting it selects the wall', () => {
    const level = box4()
    const wall = level.walls[0]!
    const group = buildWall(wall, level, level.walls)
    const skirting = trimMeshes(group, 'skirting')
    expect(skirting).toHaveLength(1)
    expect(skirting[0]!.userData.entityId).toBe(wall.id)
    expect(skirting[0]!.userData.kind).toBe('wall')
    expect(skirting[0]!.castShadow).toBe(true)
    const box = worldBox(skirting)
    expect(box.max.y).toBeCloseTo(SKIRTING.height, 4)
    expect(box.min.y).toBeCloseTo(0, 4)
    // Room is at +z (plan y > 0): the board stands on the inner face, never outside.
    expect(box.min.z).toBeGreaterThan(wall.thickness / 2 - 1e-3)
    expect(box.max.z).toBeCloseTo(wall.thickness / 2 + SKIRTING.depth, 3)
    // Mitred into both corners: it runs from inner face to inner face.
    expect(box.min.x).toBeCloseTo(wall.thickness / 2, 2)
    expect(box.max.x).toBeCloseTo(4 - wall.thickness / 2, 2)
    expect(worstUvError(skirting[0]!)).toBeLessThan(1e-4)
    expect(windingAgrees(skirting[0]!)).toBe(true)
  })

  it('breaks the skirting at a door but runs it under a window', () => {
    const level = box4()
    const wall = level.walls[0]!
    level.openings.push(createOpening('door', wall.id, 2))
    const rayAt = (x: number) => {
      const group = buildWall(wall, level, level.walls)
      group.updateMatrixWorld(true)
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 0.04, 1), new THREE.Vector3(0, 0, -1))
      return ray.intersectObjects(trimMeshes(group, 'skirting'), false)
    }
    expect(rayAt(2)).toHaveLength(0)
    expect(rayAt(0.8).length).toBeGreaterThan(0)
    level.openings = [createOpening('window', wall.id, 2)]
    expect(rayAt(2).length).toBeGreaterThan(0)
  })

  it('puts the shadow gap at the ceiling line, a slab lower under the storey above', () => {
    const level = box4()
    const wall = level.walls[0]!
    const plain = worldBox(trimMeshes(buildWall(wall, level, level.walls), 'shadow-gap'))
    expect(plain.max.y).toBeCloseTo(level.height, 3)
    expect(plain.max.y - plain.min.y).toBeCloseTo(0.012, 3)
    const above = { rooms: detectRooms(box4()), slab: 0.2 }
    const under = worldBox(trimMeshes(buildWall(wall, level, level.walls, { above }), 'shadow-gap'))
    expect(under.max.y).toBeCloseTo(level.height - 0.2, 3)
  })

  it('a free-standing wall outdoors gets no skirting', () => {
    const level = createLevel('Ground', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 })
    level.walls.push(wall)
    expect(trimMeshes(buildWall(wall, level, []), 'skirting')).toHaveLength(0)
  })
})

describe('opening trim', () => {
  it('cases a door on both faces and a window on the room side, with a stool in and a sill out', () => {
    const level = box4()
    const rooms = detectRooms(level)
    const wall = level.walls[0]!
    const door = createOpening('door', wall.id, 1)
    const window = createOpening('window', wall.id, 3)
    expect(roomBeside(wall, 1, 1, rooms)).not.toBeNull()
    expect(roomBeside(wall, -1, 1, rooms)).toBeNull()
    expect(openingTrim(door, wall, rooms)).toEqual({ casing: { left: true, right: true }, interior: 1 })
    expect(openingTrim(window, wall, rooms)).toEqual({ casing: { left: true, right: false }, interior: 1 })

    const group = buildOpening(window, wall, 0, { rooms })
    group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(group)
    // Stool proud of the inner face, stone sill proud of the outer one.
    expect(box.max.z).toBeGreaterThan(wall.thickness / 2 + 0.03)
    expect(box.min.z).toBeLessThan(-wall.thickness / 2 - 0.04)
    // Casing stands out round the hole on the room side.
    expect(box.max.x).toBeGreaterThan(3 + window.width / 2 + 0.05)
    group.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      expect(mesh.userData.entityId).toBe(window.id)
      expect(windingAgrees(mesh)).toBe(true)
      if (!(mesh.material as THREE.Material).transparent) expect(worstUvError(mesh)).toBeLessThan(1e-4)
    })
  })

  it('door leaves keep their pivot and carry a handle on each face', () => {
    const level = box4()
    const wall = level.walls[0]!
    const door = createOpening('door', wall.id, 2)
    const group = buildOpening(door, wall, 0, { level })
    const pivots: THREE.Object3D[] = []
    group.traverse((node) => {
      if (node.userData.doorLeaf === door.id) pivots.push(node)
    })
    expect(pivots).toHaveLength(1)
    const leaf = new THREE.Box3().setFromObject(pivots[0]!)
    // Levers stand out from both faces of a 40 mm leaf.
    expect(leaf.max.z - leaf.min.z).toBeGreaterThan(0.12)
    // A ray at handle height through the doorway still hits the leaf (it is closed).
    group.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(new THREE.Vector3(2, 1.4, 1), new THREE.Vector3(0, 0, -1))
    expect(ray.intersectObject(group, true).length).toBeGreaterThan(0)
  })
})

describe('roof trim', () => {
  const gable = (): Roof => ({
    id: 'r',
    shape: 'gable',
    outline: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ],
    pitch: Math.PI / 6,
    overhang: 0.35,
    ridgeAngle: 0,
    thickness: 0.08,
    material: { id: 'roof-tiles' },
    cutouts: [],
  })

  it('adds ridge caps, fascia and gutters that hide with the roof, and four downpipes to the ground', () => {
    const level = createLevel('Upper', 2.7)
    const group = buildRoof(gable(), level)
    for (const name of ['ridge', 'fascia', 'gutter']) {
      const meshes = trimMeshes(group, name)
      expect(meshes, name).toHaveLength(1)
      expect(meshes[0]!.userData.roof).toBe(true)
      expect(meshes[0]!.userData.entityId).toBe('r')
    }
    const metal = worldBox(trimMeshes(group, 'gutter'))
    // Downpipes reach the floor of the roof's level; gutters hang past the eaves.
    expect(metal.min.y).toBeLessThan(level.elevation + 0.05)
    expect(metal.min.z).toBeLessThan(-0.35)
    expect(metal.max.z).toBeGreaterThan(4.35)
    const ridge = worldBox(trimMeshes(group, 'ridge'))
    const roofTop = new THREE.Box3().setFromObject(group).max.y
    expect(ridge.max.y).toBeCloseTo(roofTop, 3)
  })

  it('flat roofs stay plain', () => {
    const level = createLevel('Ground', 0)
    const roof = { ...gable(), shape: 'flat' as const }
    expect(trimMeshes(buildRoof(roof, level), 'gutter')).toHaveLength(0)
  })
})

describe('trim geometry kit', () => {
  it('a chamfered box has 44 outward triangles and metric uvs', () => {
    const sheet = new Sheet()
    chamferBox(sheet, 0.4, 0.3, 0.2, 0, 0, 0, 0.01)
    expect(sheet.triangles).toBe(44)
    const mesh = sheet.mesh(new THREE.MeshStandardMaterial())!
    expect(windingAgrees(mesh)).toBe(true)
    expect(worstUvError(mesh)).toBeLessThan(1e-5)
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const norm = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i)
      const n = new THREE.Vector3().fromBufferAttribute(norm, i)
      expect(p.dot(n)).toBeGreaterThan(0)
    }
  })

  it('sweeps a profile round a mitred corner', () => {
    const sheet = new Sheet()
    const o = vec3(0, 0, 1)
    sweep(
      sheet,
      [
        { p: vec3(0, 0, 0), s: vec3(-1, 0, 0), o },
        { p: vec3(0, 1, 0), s: vec3(-1, 1, 0), o },
        { p: vec3(1, 1, 0), s: vec3(0, 1, 0), o },
      ],
      [
        [0, 0],
        [0.1, 0],
        [0.1, 0.02],
        [0, 0.02],
        [0, 0],
      ],
      { skip: [0] },
    )
    const mesh = sheet.mesh(new THREE.MeshStandardMaterial())!
    const box = new THREE.Box3().setFromObject(mesh)
    expect(box.min.x).toBeCloseTo(-0.1, 6)
    expect(box.max.y).toBeCloseTo(1.1, 6)
    expect(worstUvError(mesh)).toBeLessThan(1e-5)
  })

  it('a terrace slab gets bevel strips along its top edge', () => {
    const level = createLevel('Ground', 0)
    const group = buildSlab(
      {
        id: 's',
        polygon: [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 2 },
          { x: 0, y: 2 },
        ],
        thickness: 0.2,
        top: 0.1,
        material: { id: 'concrete' },
      },
      level,
    )
    expect(group.children).toHaveLength(2)
    const strip = group.children[1] as THREE.Mesh
    expect(strip.userData.entityId).toBe('s')
    expect(worstUvError(strip)).toBeLessThan(1e-4)
  })
})

describe('family template trim budget', () => {
  it('stays within a modest triangle and mesh budget per level', () => {
    const project = TEMPLATES.find((t) => t.id === 'family')!.create()
    for (const level of project.levels) {
      let tris = 0
      let meshes = 0
      for (const wall of level.walls) {
        const objects = [buildWall(wall, level, level.walls)]
        for (const opening of level.openings.filter((o) => o.wallId === wall.id)) objects.push(buildOpening(opening, wall, level.elevation, { level }))
        for (const obj of objects) {
          obj.traverse((node) => {
            const mesh = node as THREE.Mesh
            if (!mesh.isMesh) return
            meshes++
            const geo = mesh.geometry
            tris += (geo.getIndex()?.count ?? geo.getAttribute('position').count) / 3
          })
        }
      }
      expect(tris, level.name).toBeLessThan(20_000)
      expect(meshes, level.name).toBeLessThan(120)
    }
  })
})
