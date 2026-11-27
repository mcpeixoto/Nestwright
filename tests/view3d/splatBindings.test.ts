import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createSplatMaterial, disposeSplatMaterial, groundLayerArray } from '../../src/view3d/terrain/textures'

/** Distinct textures the material's colour and normal graphs sample. three gives each one a sampler. */
function sampledTextures(mat: THREE.MeshStandardNodeMaterial): Set<THREE.Texture> {
  const found = new Set<THREE.Texture>()
  const visit = (root: THREE.Node | null | undefined) => {
    root?.traverse((node) => {
      const tex = (node as { isTextureNode?: boolean; value?: THREE.Texture }).isTextureNode
        ? (node as { value?: THREE.Texture }).value
        : undefined
      if (tex) found.add(tex)
    })
  }
  visit(mat.colorNode)
  visit(mat.normalNode)
  return found
}

describe('ground splat bindings', () => {
  it('samples at most five textures, so Ultra stays under the 16-sampler fragment limit', () => {
    // Shadows, the environment and the light probes take the rest of the fragment stage's 16
    // samplers at Ultra. Seven separate layer textures put the ground pipeline at 17 and the
    // ground vanished on WebGPU.
    const mat = createSplatMaterial()
    const textures = sampledTextures(mat)
    expect(textures.size).toBeLessThanOrEqual(5)
    expect(textures.has(groundLayerArray())).toBe(true)
    disposeSplatMaterial(mat)
  })

  it('packs the seven non-lawn layers into one sRGB, repeating array texture', () => {
    const array = groundLayerArray()
    expect(array.isDataArrayTexture).toBe(true)
    expect(array.image.depth).toBe(7)
    expect(array.image.data?.length).toBe(array.image.width * array.image.height * 7 * 4)
    expect(array.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(array.wrapS).toBe(THREE.RepeatWrapping)
    expect(array.wrapT).toBe(THREE.RepeatWrapping)
    expect(groundLayerArray()).toBe(array)
  })
})
