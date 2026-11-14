import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createTerrain } from '../../src/model/defaults'
import { PLANT_SWAY_ATTRIBUTE, PlantField, swayPhase } from '../../src/view3d/terrain/plants'

function field() {
  const terrain = createTerrain(40, 30, 32)
  terrain.plants.push(
    { id: 'a', species: 'oak', position: { x: 2, y: 3 }, scale: 1.5, rotation: 0.4 },
    { id: 'b', species: 'oak', position: { x: 5, y: 1 }, scale: 0.8, rotation: 2 },
  )
  const plants = new PlantField()
  plants.sync(terrain)
  return { plants, terrain }
}

describe('plant sway', () => {
  it('keys the gust phase off the plant origin', () => {
    expect(swayPhase(0, 0)).toBe(0)
    expect(swayPhase(2, 3)).toBeCloseTo(2 * 0.37 + 3 * 0.23)
  })

  it('writes phase and scale per instance and shares the species vertex buffers', () => {
    const { plants, terrain } = field()
    const mesh = plants.group.children[0] as THREE.InstancedMesh
    expect(mesh.count).toBe(2)
    const info = mesh.geometry.getAttribute(PLANT_SWAY_ATTRIBUTE) as THREE.InstancedBufferAttribute
    expect(info.isInstancedBufferAttribute).toBe(true)
    expect(info.getX(0)).toBeCloseTo(swayPhase(2, 3))
    expect(info.getY(0)).toBeCloseTo(1.5)
    expect(info.getX(1)).toBeCloseTo(swayPhase(5, 1))
    expect(info.getY(1)).toBeCloseTo(0.8)

    // A second chunk of the same species reuses the position buffer.
    terrain.plants.push({ id: 'c', species: 'oak', position: { x: 30, y: 20 }, scale: 1, rotation: 0 })
    plants.sync(terrain)
    const meshes = plants.group.children as THREE.InstancedMesh[]
    expect(meshes.length).toBe(2)
    expect(meshes[0]?.geometry.getAttribute('position')).toBe(meshes[1]?.geometry.getAttribute('position'))
    expect(meshes[0]?.geometry.getAttribute(PLANT_SWAY_ATTRIBUTE)).not.toBe(meshes[1]?.geometry.getAttribute(PLANT_SWAY_ATTRIBUTE))
    plants.dispose()
  })

  it('sways nothing at the base: every base vertex of a trunk has y = 0', () => {
    const { plants } = field()
    const mesh = plants.group.children[0] as THREE.InstancedMesh
    const pos = mesh.geometry.getAttribute('position')
    let minY = Infinity
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i))
    expect(minY).toBeCloseTo(0)
    plants.dispose()
  })
})
