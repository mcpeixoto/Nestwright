import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../../src/catalog'
import { buildColumn } from '../../src/builders/columns'
import { buildFloors } from '../../src/builders/floors'
import { buildItem } from '../../src/builders/items'
import { buildOpening } from '../../src/builders/openings'
import { buildRoof } from '../../src/builders/roofs'
import { buildSlab } from '../../src/builders/slabs'
import { buildStair } from '../../src/builders/stairs'
import { buildWall } from '../../src/builders/walls'
import { listEntries } from '../../src/catalog/registry'
import { getMaterial } from '../../src/materials/materialCache'
import { createLevel, createWall } from '../../src/model/defaults'
import { detectRooms } from '../../src/model/rooms'
import type { Level, Stair, StairShape } from '../../src/model/types'
import { TEMPLATES } from '../../src/templates'

/** Every mesh a builder makes must carry UVs: library materials are textured and sample `uv`. */
function missingUv(label: string, root: THREE.Object3D, out: string[]): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry as THREE.BufferGeometry
    if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) return
    const uv = geo.getAttribute('uv')
    if (!uv) {
      out.push(`${label}: ${mesh.userData.kind ?? mesh.name ?? mesh.type} has no uv`)
      return
    }
    for (let i = 0; i < uv.count; i++) {
      if (!Number.isFinite(uv.getX(i)) || !Number.isFinite(uv.getY(i))) {
        out.push(`${label}: ${mesh.userData.kind ?? mesh.type} has a non-finite uv`)
        return
      }
    }
  })
}

function buildLevel(level: Level, out: string[], label: string): void {
  for (const wall of level.walls) {
    missingUv(`${label} wall`, buildWall(wall, level, level.walls), out)
    for (const opening of level.openings) {
      if (opening.wallId === wall.id) missingUv(`${label} opening`, buildOpening(opening, wall, level.elevation), out)
    }
  }
  missingUv(`${label} floors`, buildFloors(level, detectRooms(level), {}), out)
  for (const roof of level.roofs) missingUv(`${label} roof`, buildRoof(roof, level), out)
  for (const stair of level.stairs) missingUv(`${label} stair`, buildStair(stair, level), out)
  for (const slab of level.slabs ?? []) missingUv(`${label} slab`, buildSlab(slab, level), out)
  for (const column of level.columns ?? []) missingUv(`${label} column`, buildColumn(column, level), out)
  for (const item of level.items) missingUv(`${label} item ${item.catalogId}`, buildItem(item), out)
}

describe('builder uvs', () => {
  it('every template mesh has a uv attribute', () => {
    const out: string[] = []
    for (const template of TEMPLATES) {
      const project = template.create()
      for (const level of project.levels) buildLevel(level, out, `${template.id}/${level.name}`)
    }
    expect([...new Set(out)]).toEqual([])
  })

  it('every stair shape has uvs, with metric u along risers and stringers', () => {
    const level = createLevel('Ground', 0)
    level.walls.push(createWall({ x: 0, y: 0 }, { x: 6, y: 0 }))
    const out: string[] = []
    const shapes: StairShape[] = ['straight', 'l-shape', 'u-shape', 'spiral']
    for (const shape of shapes) {
      const stair: Stair = {
        id: `stair-${shape}`,
        shape,
        position: { x: 2, y: 2 },
        rotation: 0,
        width: 0.9,
        rise: 2.7,
        turnLeft: true,
        material: { id: 'oak-planks' },
        railing: true,
      }
      const group = buildStair(stair, level)
      missingUv(shape, group, out)
      // u spans metres, not 0..1: some mesh in a stair is longer than 1 m along u.
      let maxU = 0
      group.traverse((node) => {
        const mesh = node as THREE.Mesh
        const uv = mesh.isMesh ? mesh.geometry.getAttribute('uv') : null
        if (uv) for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i))
      })
      expect(maxU, shape).toBeGreaterThan(1)
    }
    expect(out).toEqual([])
  })

  it('every catalog entry has uvs', () => {
    const out: string[] = []
    for (const entry of listEntries()) {
      const materials: Record<string, THREE.MeshStandardMaterial> = {}
      for (const [slot, ref] of Object.entries(entry.materialSlots)) materials[slot] = getMaterial(ref)
      missingUv(entry.id, entry.build({ size: entry.defaultSize, materials, params: {} }), out)
    }
    expect(out).toEqual([])
  })
})
