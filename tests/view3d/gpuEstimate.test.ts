import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { estimateGpuBytes, textureByteSize } from '../../src/view3d/gpuEstimate'

describe('gpu byte estimate', () => {
  it('counts RGBA8 texels and the mip chain', () => {
    expect(textureByteSize(0, 4, false)).toBe(0)
    expect(textureByteSize(2, 2, false)).toBe(16)
    expect(textureByteSize(2, 2, true)).toBe((16 * 4) / 3)
    expect(textureByteSize(2, 2, false, 6)).toBe(96)
    expect(textureByteSize(256, 256, true)).toBe((256 * 256 * 4 * 4) / 3)
  })

  it('sums one copy of a shared geometry and texture', () => {
    const positions = new Float32Array(9)
    const index = new Uint16Array([0, 1, 2])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    const data = new Uint8Array(4 * 4 * 4)
    const tex = new THREE.DataTexture(data, 4, 4)
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    const material = new THREE.MeshBasicMaterial({ map: tex })
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(geo, material))
    scene.add(new THREE.Mesh(geo, material))
    const expected = positions.byteLength + index.byteLength + textureByteSize(4, 4, false)
    expect(estimateGpuBytes(scene)).toBe(expected)
    scene.environment = tex
    expect(estimateGpuBytes(scene)).toBe(expected)
  })
})
