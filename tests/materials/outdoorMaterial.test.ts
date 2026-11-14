import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  getMaterial,
  isCachedMaterial,
  isOutdoorMaterial,
  materialCacheKey,
  outdoorVariant,
} from '../../src/materials/materialCache'
import { attachWeather, dressOutdoorMesh, isOutdoorMesh } from '../../src/view3d/atmosphere/weather'

type WithNodes = THREE.MeshStandardMaterial & { colorNode?: unknown; roughnessNode?: unknown }

describe('outdoor material keying', () => {
  it('keys the outdoor twin apart from the indoor material', () => {
    expect(materialCacheKey({ id: 'roof-metal' })).toBe('roof-metal||1')
    expect(materialCacheKey({ id: 'roof-metal' }, { outdoor: true })).toBe('roof-metal||1|outdoor')
    expect(materialCacheKey({ id: 'oak-planks', tint: '#aa0000', scale: 2 }, { outdoor: true })).toBe('oak-planks|#aa0000|2|outdoor')
    expect(materialCacheKey(undefined)).toBe('plaster-white||1')
  })

  it('returns one shared twin per ref, distinct from the indoor instance', () => {
    const indoor = getMaterial({ id: 'brick-red' })
    const outdoor = getMaterial({ id: 'brick-red' }, { outdoor: true })
    expect(outdoor).not.toBe(indoor)
    expect(getMaterial({ id: 'brick-red' }, { outdoor: true })).toBe(outdoor)
    expect(outdoorVariant(indoor)).toBe(outdoor)
    expect(outdoorVariant(outdoor)).toBe(outdoor)
    expect(isOutdoorMaterial(outdoor)).toBe(true)
    expect(isOutdoorMaterial(indoor)).toBe(false)
    expect(isCachedMaterial(indoor)).toBe(true)
    // Textures are shared, not copied.
    expect(outdoor.map).toBe(indoor.map)
  })

  it('leaves a material the cache did not make as it is', () => {
    const own = new THREE.MeshStandardMaterial()
    expect(outdoorVariant(own)).toBe(own)
    expect(isCachedMaterial(own)).toBe(false)
  })
})

describe('weather on outdoor meshes', () => {
  it('puts the weather on the outdoor twin and never on the indoor material', () => {
    const ref = { id: 'roof-metal' }
    const indoor = getMaterial(ref) as WithNodes
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), indoor)
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), indoor)
    roof.userData.roof = true
    expect(isOutdoorMesh(roof)).toBe(true)
    expect(isOutdoorMesh(floor)).toBe(false)

    dressOutdoorMesh(roof)
    expect(roof.material).not.toBe(indoor)
    expect(roof.material).toBe(getMaterial(ref, { outdoor: true }))
    expect((roof.material as WithNodes).colorNode).toBeTruthy()
    expect(floor.material).toBe(indoor)
    expect(indoor.colorNode ?? null).toBeNull()
    expect(indoor.roughnessNode ?? null).toBeNull()

    // Dressing again is a no-op: same twin, no second wrap.
    const node = (roof.material as WithNodes).colorNode
    dressOutdoorMesh(roof)
    expect((roof.material as WithNodes).colorNode).toBe(node)
  })

  it('refuses to patch a shared indoor library material directly', () => {
    const indoor = getMaterial({ id: 'plaster-white' }) as WithNodes
    attachWeather(indoor)
    expect(indoor.colorNode ?? null).toBeNull()
  })

  it('handles multi-material meshes', () => {
    const a = getMaterial({ id: 'oak-planks' })
    const own = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [a, own])
    mesh.userData.outdoor = true
    dressOutdoorMesh(mesh)
    const list = mesh.material as THREE.Material[]
    expect(list[0]).toBe(getMaterial({ id: 'oak-planks' }, { outdoor: true }))
    expect(list[1]).toBe(own)
    expect((own as WithNodes).colorNode).toBeTruthy()
    expect((a as WithNodes).colorNode ?? null).toBeNull()
  })
})
