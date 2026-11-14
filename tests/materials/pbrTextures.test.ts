import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentUrl, transcoderPath } from '../../src/materials/contentUrl'
import { getMaterialDef } from '../../src/materials/library'
import { applyPbrMaps, getMaterial, outdoorVariant } from '../../src/materials/materialCache'
import {
  albedoTint,
  blockAligned,
  loadPbrMaps,
  packedNormalNode,
  pbrScalars,
  tileRepeat,
  type PbrMaps,
} from '../../src/materials/pbrTextures'
import { srgbByteToLinear } from '../../src/view3d/colorLinear'

function fakeMaps(meanOrm: [number, number, number], meanAlbedoSrgb: [number, number, number] = [128, 128, 128]): PbrMaps {
  const normal = new THREE.Texture()
  return {
    info: { key: 'test-tex', tileMeters: 2, meanAlbedoSrgb, meanOrm, maps: { albedo: 'a', normal: 'n', orm: 'o' } },
    albedo: new THREE.Texture(),
    normal,
    orm: new THREE.Texture(),
    normalNode: packedNormalNode(normal),
  }
}

describe('scan geometry', () => {
  it('repeats a non-square scan faster along v so it is not stretched', () => {
    expect(tileRepeat(2, 2048, 2048)).toEqual([0.5, 0.5])
    expect(tileRepeat(1.1, 2048, 1024)).toEqual([1 / 1.1, 1 / 0.55])
    expect(tileRepeat(2, 1024, 1024, 2)).toEqual([1, 1])
  })

  it('reads the two-channel normal from G and A', () => {
    const node = packedNormalNode(new THREE.Texture()) as unknown as { unpackNormalMode: string }
    expect(node.unpackNormalMode).toBe(THREE.NormalGAPacking)
    expect(packedNormalNode(null)).toBeNull()
  })

  it('flags compressed textures that are not whole 4×4 blocks', () => {
    const odd = new THREE.CompressedTexture([], 1022, 1024)
    const even = new THREE.CompressedTexture([], 1020, 1024)
    expect(blockAligned(odd)).toBe(false)
    expect(blockAligned(even)).toBe(true)
    expect(blockAligned(new THREE.Texture())).toBe(true)
  })
})

describe('content urls', () => {
  it('serves the pack over http in dev and over nwcontent:// from file://', () => {
    expect(contentUrl('textures/a/albedo.ktx2', 'http:')).toBe('./content/textures/a/albedo.ktx2')
    expect(contentUrl('/index.json', 'http:')).toBe('./content/index.json')
    expect(contentUrl('textures/a/albedo.ktx2', 'file:')).toBe('nwcontent://content/textures/a/albedo.ktx2')
    expect(transcoderPath('http:')).toBe('')
    expect(transcoderPath('file:')).toBe('nwcontent://basis/')
  })
})

describe('scan normalisation', () => {
  it('divides roughness and metalness by the map mean so the average stays the library value', () => {
    const s = pbrScalars(0.62, 0.9, [0.8, 0.5, 0.9])
    expect(s.roughness * 0.5).toBeCloseTo(0.62, 6)
    expect(s.metalness * 0.9).toBeCloseTo(0.9, 6)
    expect(s.roughnessMap && s.metalnessMap && s.aoMap).toBe(true)
  })

  it('drops constant-fill channels: black metalness and white AO are not scans', () => {
    const s = pbrScalars(0.4, 0.95, [1, 0.3, 0])
    expect(s.metalnessMap).toBe(false)
    expect(s.metalness).toBe(0.95)
    expect(s.aoMap).toBe(false)
    expect(s.roughness * 0.3).toBeCloseTo(0.4, 6)
    // A dielectric never samples a metalness map, even if the scan has a faint one.
    expect(pbrScalars(0.5, 0, [1, 0.5, 0.2]).metalnessMap).toBe(false)
  })

  it('lifts a dark scan of a light surface onto the swatch brightness', () => {
    // Poly Haven white plaster averages sRGB (142, 135, 122); the library swatch is #d5d2cb.
    const mean: [number, number, number] = [142, 135, 122]
    const tint = albedoTint('#d5d2cb', mean)!
    const lit = mean.map((v, i) => srgbByteToLinear(v) * [tint.r, tint.g, tint.b][i]!)
    const want = new THREE.Color('#d5d2cb')
    expect(lit[0]).toBeCloseTo(want.r, 2)
    expect(lit[1]).toBeCloseTo(want.g, 2)
    expect(lit[2]).toBeCloseTo(want.b, 2)
  })

  it('bends hue at most ±40% and clamps brightness to ×3', () => {
    const tint = albedoTint('#808080', [100, 128, 150])!
    expect(Math.max(tint.r, tint.g, tint.b) / Math.min(tint.r, tint.g, tint.b)).toBeLessThanOrEqual(2 + 1e-9)
    const dark = albedoTint('#d0d0d0', [110, 110, 110])!
    expect(dark.r).toBeCloseTo(3, 6)
  })

  it('refuses a scan that is a different material from the swatch', () => {
    // A red velvet scan behind "Green velvet", and a black penny tile behind a white one.
    expect(albedoTint('#5e9b86', [174, 45, 71])).toBeNull()
    expect(albedoTint('#e8e4dc', [31, 31, 30])).toBeNull()
  })
})

describe('swapping scanned maps into a cached material', () => {
  it('keeps the same material object, averages to the def roughness, and recompiles once', () => {
    const mat = getMaterial({ id: 'oak-planks' })
    const def = getMaterialDef('oak-planks')!
    const maps = fakeMaps([0.9, 0.5, 0], [155, 128, 99])
    const source = { def, scale: 1, tint: '', roughness: def.roughness, metalness: def.metalness }
    const v0 = mat.version
    applyPbrMaps(mat, source, maps)
    expect(mat).toBe(getMaterial({ id: 'oak-planks' }))
    expect(mat.map).toBe(maps.albedo)
    expect(mat.normalMap).toBeNull()
    expect((mat as unknown as { normalNode: unknown }).normalNode).toBe(maps.normalNode)
    expect(mat.roughnessMap).toBe(maps.orm)
    expect(mat.aoMap).toBe(maps.orm)
    expect(mat.metalnessMap).toBeNull()
    expect(mat.bumpMap).toBeNull()
    expect(mat.roughness * 0.5).toBeCloseTo(def.roughness, 6)
    const v1 = mat.version
    expect(v1).toBeGreaterThan(v0)
    // Same maps again (a twin cloned after the swap): uniforms only, no new program.
    applyPbrMaps(mat, source, maps)
    expect(mat.version).toBe(v1)
  })

  it('gives an outdoor twin the scan too', () => {
    const indoor = getMaterial({ id: 'brick-red' })
    const twin = outdoorVariant(indoor) as THREE.MeshStandardMaterial
    expect(twin).not.toBe(indoor)
    const def = getMaterialDef('brick-red')!
    applyPbrMaps(twin, { def, scale: 1, tint: '#ff0000', roughness: def.roughness, metalness: 0 }, fakeMaps([0.8, 0.8, 0], [161, 112, 88]))
    expect(twin.map).not.toBeNull()
    expect(twin.color.g).toBe(0)
  })

  it('without a renderer, never fetches (tests, 2D-only)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    let settled = false
    void loadPbrMaps('oak-planks').then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(settled).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('without content, a library material keeps its def roughness (no halving)', () => {
    for (const id of ['plaster-white', 'concrete', 'marble']) {
      const def = getMaterialDef(id)!
      expect(getMaterial({ id }).roughness).toBeCloseTo(def.roughness, 6)
    }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
