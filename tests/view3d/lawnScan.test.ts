import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { isOutdoorMaterial } from '../../src/materials/materialCache'
import type { PbrMaps } from '../../src/materials/pbrTextures'
import { srgbByteToLinear } from '../../src/view3d/colorLinear'
import { groundMaterial } from '../../src/view3d/layers/ground'
import { POOL_ROUGHNESS, POOL_SPECULAR, POOL_WAVES, poolSlope } from '../../src/view3d/terrain/features'
import {
  LAWN_ALBEDO,
  LAWN_MACRO_AMOUNT,
  applyLawnScan,
  createSplatMaterial,
  disposeSplatMaterial,
  lawnHex,
} from '../../src/view3d/terrain/textures'

function fakeMaps(mean: [number, number, number], tileMeters = 2.51, withNormal = true): PbrMaps {
  return {
    info: { key: 'lawn-fine-tex', tileMeters, meanAlbedoSrgb: mean, maps: { albedo: 'a.ktx2' } },
    albedo: new THREE.Texture(),
    normal: withNormal ? new THREE.Texture() : null,
    orm: null,
    normalNode: null,
  }
}

interface Slots {
  albedo: { value: THREE.Texture }
  normal: { value: THREE.Texture }
  tiling: { value: number }
  tint: { value: THREE.Color }
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('scanned lawn in the ground splat', () => {
  it('starts procedural, with a relief slot ready', () => {
    const mat = createSplatMaterial()
    const slots = mat.userData.lawn as Slots
    expect(slots).toBeDefined()
    expect(slots.tiling.value).toBeCloseTo(0.07)
    expect(mat.normalNode).toBeTruthy()
    disposeSplatMaterial(mat)
  })

  it('swaps in the scan, its tile size, and a tint that keeps the lawn colour', () => {
    const mat = createSplatMaterial()
    const maps = fakeMaps([92, 108, 60])
    expect(applyLawnScan(mat, maps)).toBe(true)
    const slots = mat.userData.lawn as Slots
    expect(slots.albedo.value).toBe(maps.albedo)
    expect(slots.normal.value).toBe(maps.normal)
    expect(slots.tiling.value).toBeCloseTo(1 / 2.51)
    // Tinted scan mean should land on LAWN_ALBEDO's brightness (linear).
    const have = [92, 108, 60].map(srgbByteToLinear)
    const tint = slots.tint.value
    const got = lum(have[0]! * tint.r, have[1]! * tint.g, have[2]! * tint.b)
    const want = lum(srgbByteToLinear(LAWN_ALBEDO.r), srgbByteToLinear(LAWN_ALBEDO.g), srgbByteToLinear(LAWN_ALBEDO.b))
    expect(got / want).toBeGreaterThan(0.97)
    expect(got / want).toBeLessThan(1.03)
    expect(mat.userData.scanned).toBe('lawn-fine-tex')
    disposeSplatMaterial(mat)
  })

  it('keeps the procedural relief when the scan has no normal map', () => {
    const mat = createSplatMaterial()
    const before = (mat.userData.lawn as Slots).normal.value
    expect(applyLawnScan(mat, fakeMaps([92, 108, 60], 2, false))).toBe(true)
    expect((mat.userData.lawn as Slots).normal.value).toBe(before)
    disposeSplatMaterial(mat)
  })

  it('refuses a scan that is not lawn-coloured, and one with no tile size', () => {
    const mat = createSplatMaterial()
    const slots = mat.userData.lawn as Slots
    const procedural = slots.albedo.value
    expect(applyLawnScan(mat, fakeMaps([200, 30, 40]))).toBe(false)
    expect(applyLawnScan(mat, fakeMaps([92, 108, 60], 0))).toBe(false)
    expect(slots.albedo.value).toBe(procedural)
    expect(slots.tiling.value).toBeCloseTo(0.07)
    disposeSplatMaterial(mat)
  })

  it('names the lawn colour as hex and keeps the macro swell gentle', () => {
    expect(lawnHex()).toBe('#4c7030')
    expect(LAWN_MACRO_AMOUNT).toBeGreaterThan(0)
    expect(LAWN_MACRO_AMOUNT).toBeLessThanOrEqual(0.2)
  })
})

describe('flat ground planes', () => {
  it('share the cached outdoor lawn, so the scan reaches them', () => {
    const a = groundMaterial()
    expect(groundMaterial()).toBe(a)
    expect(isOutdoorMaterial(a)).toBe(true)
  })
})

describe('pool water', () => {
  it('is glossy', () => {
    expect(POOL_ROUGHNESS).toBeLessThanOrEqual(0.06)
    // Weaker than a plain dielectric, so a grazing view keeps the water colour.
    expect(POOL_SPECULAR).toBeGreaterThan(0.3)
    expect(POOL_SPECULAR).toBeLessThan(1)
  })

  it('ripples gently and moves with time', () => {
    const bound = POOL_WAVES.reduce((sum, wave) => sum + wave.a, 0)
    expect(bound).toBeLessThan(0.08)
    let peak = 0
    for (let i = 0; i < 400; i++) {
      const s = poolSlope(i * 0.137, i * 0.071, i * 0.05)
      peak = Math.max(peak, Math.hypot(s.dx, s.dz))
    }
    expect(peak).toBeGreaterThan(0.01)
    expect(peak).toBeLessThanOrEqual(bound + 1e-9)
    const a = poolSlope(1.3, 2.1, 0)
    const b = poolSlope(1.3, 2.1, 0.7)
    expect(Math.hypot(a.dx - b.dx, a.dz - b.dz)).toBeGreaterThan(1e-3)
  })
})
