import * as THREE from 'three'
import { uniform } from 'three/tsl'
import type { GraphicsQuality } from '../../settings'

/** Key light direction (towards the light) and colour × intensity, for leaf forward scatter. */
export const foliageSunDir = uniform(new THREE.Vector3(0, 1, 0))
export const foliageSunColor = uniform(new THREE.Color(0, 0, 0))

/** Called by the atmosphere each frame with the light that owns the shadow map. */
export function setFoliageSun(direction: THREE.Vector3, color: THREE.Color, intensity: number): void {
  foliageSunDir.value.copy(direction).normalize()
  const k = Number.isFinite(intensity) ? Math.max(0, intensity) : 0
  foliageSunColor.value.setRGB(color.r * k, color.g * k, color.b * k)
}

/**
 * Leaf cards cast alpha-tested (dappled) shadows from High up. Below that only trunks,
 * branches and the old solid plants cast, which keeps Medium inside its cascade budget.
 */
export function leafShadowsFor(tier: GraphicsQuality): boolean {
  return tier === 'high' || tier === 'ultra'
}

/**
 * Plant batches are built with castShadow off by `terrain/plants.ts`. castShadow is not in
 * the main pass cache key, so turning it on here only adds the plants to the shadow passes;
 * their wind positionNode is reused by the depth material, so shadows sway with the leaves.
 * Meshes tagged `userData.leafCards` follow the tier instead.
 */
export function castFoliageShadows(scene: THREE.Scene, tier: GraphicsQuality = 'high'): number {
  const plants = scene.getObjectByName('plants')
  if (!plants) return 0
  const leaves = leafShadowsFor(tier)
  let count = 0
  plants.traverse((obj) => {
    const mesh = obj as THREE.InstancedMesh
    if (!mesh.isInstancedMesh || mesh.userData.kind !== 'plant') return
    if (mesh.userData.noShadow === true) return
    const want = mesh.userData.leafCards === true ? leaves : true
    if (mesh.castShadow !== want) mesh.castShadow = want
    count++
  })
  return count
}
