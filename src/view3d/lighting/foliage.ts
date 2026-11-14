import type * as THREE from 'three'

/**
 * Plant batches are built with castShadow off by `terrain/plants.ts`. castShadow is not in
 * the main pass cache key, so turning it on here only adds the plants to the shadow passes;
 * their wind positionNode is reused by the depth material, so shadows sway with the leaves.
 */
export function castFoliageShadows(scene: THREE.Scene): number {
  const plants = scene.getObjectByName('plants')
  if (!plants) return 0
  let count = 0
  plants.traverse((obj) => {
    const mesh = obj as THREE.InstancedMesh
    if (!mesh.isInstancedMesh || mesh.userData.kind !== 'plant') return
    if (!mesh.castShadow) mesh.castShadow = true
    count++
  })
  return count
}
