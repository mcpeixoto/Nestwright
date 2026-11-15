import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createOutdoorLights } from '../../src/view3d/lighting/outdoorLights'
import { PROBE_LAYER, ProbeVolume } from '../../src/view3d/lighting/probeVolume'

describe('ProbeVolume', () => {
  it('allocates its atlas once for its capacity: seven padded SH sub-volumes', () => {
    const volume = new ProbeVolume({ x: 24, y: 4, z: 20 })
    const atlas = volume.atlas
    expect(atlas.width).toBe(24)
    expect(atlas.height).toBe(4)
    expect(atlas.depth).toBe(7 * (20 + 2))
    volume.install({ x: 10, y: 3, z: 8 }, new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 2.7, 8)))
    expect(volume.atlas).toBe(atlas)
    expect(volume.resolution.toArray()).toEqual([10, 3, 8])
    expect(volume.boundingBox.max.toArray()).toEqual([10, 2.7, 8])
    volume.intensity = 1
    volume.park()
    expect(volume.intensity).toBe(0)
    expect(volume.boundingBox.containsPoint(new THREE.Vector3(5, 1, 4))).toBe(false)
    volume.dispose()
  })

  it('uses a layer the main view does not draw', () => {
    expect(PROBE_LAYER).not.toBe(0)
  })
})

describe('outdoor light list', () => {
  it('leaves out probe volumes, the probe bake sun and the lamp pool', () => {
    const scene = new THREE.Scene()
    const hemi = new THREE.HemisphereLight()
    const volume = new ProbeVolume({ x: 2, y: 2, z: 2 })
    volume.userData.probeVolume = true
    const bake = new THREE.DirectionalLight()
    bake.userData.probeBake = true
    const pool = new THREE.PointLight()
    pool.userData.lampPool = true
    scene.add(hemi, volume, bake, pool)
    const outdoor = createOutdoorLights(scene)
    const material = new THREE.MeshStandardNodeMaterial()
    outdoor.apply(material)
    const listed = (material.lightsNode as unknown as { getLights(): THREE.Light[] }).getLights()
    expect(listed).toContain(hemi)
    expect(listed).not.toContain(volume)
    expect(listed).not.toContain(bake)
    expect(listed).not.toContain(pool)
    volume.dispose()
  })
})
