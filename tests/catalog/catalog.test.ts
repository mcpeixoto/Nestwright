import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../../src/catalog'
import { listEntries } from '../../src/catalog/registry'
import { getMaterial } from '../../src/materials/materialCache'

function materialsOf(slots: Record<string, { id: string }>): Record<string, THREE.MeshStandardMaterial> {
  const materials: Record<string, THREE.MeshStandardMaterial> = {}
  for (const [slot, ref] of Object.entries(slots)) materials[slot] = getMaterial(ref)
  return materials
}

function expectSize(id: string, group: THREE.Object3D, size: { w: number; d: number; h: number }) {
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  const eps = 0.02
  const check = (axis: string, got: number, want: number) => {
    if (!Number.isFinite(got) || Math.abs(got - want) > eps) {
      throw new Error(`${id} ${axis}: got ${got.toFixed(4)} want ${want.toFixed(4)} (size ${size.w.toFixed(2)}×${size.d.toFixed(2)}×${size.h.toFixed(2)})`)
    }
  }
  check('min.x', box.min.x, -size.w / 2)
  check('max.x', box.max.x, size.w / 2)
  check('min.y', box.min.y, 0)
  check('max.y', box.max.y, size.h)
  check('min.z', box.min.z, -size.d / 2)
  check('max.z', box.max.z, size.d / 2)
  group.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) mesh.geometry?.dispose()
  })
}

describe('catalog', () => {
  it('builds every entry to its size, with a price and a unique id', { timeout: 60_000 }, () => {
    const entries = listEntries()
    expect(entries.length).toBeGreaterThanOrEqual(80)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
    const problems: string[] = []
    for (const entry of entries) {
      expect(entry.price, entry.id).toBeGreaterThan(0)
      const materials = materialsOf(entry.materialSlots)
      const built = entry.build({ size: entry.defaultSize, materials, params: {} })
      try {
        expectSize(entry.id, built, entry.defaultSize)
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }
      const stretched = {
        w: Math.max(0.2, entry.defaultSize.w * 1.7),
        d: Math.max(0.2, entry.defaultSize.d * 0.62),
        h: Math.max(0.2, entry.defaultSize.h * 1.35),
      }
      const again = entry.build({ size: stretched, materials, params: {} })
      try {
        expectSize(`${entry.id} stretched`, again, stretched)
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }
    }
    expect(problems).toEqual([])
  })
})
