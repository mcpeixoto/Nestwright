import * as THREE from 'three'
import { getMaterialDef } from '../../materials/library'
import { getMaterial } from '../../materials/materialCache'
import type { Project } from '../../model/types'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext } from '../layers'

/** Houses sit in a meadow. Apartment blocks sit on asphalt, with the city layer behind them. */
export function distantGroundMode(kind: string | undefined): 'meadow' | 'asphalt' {
  return kind === 'apartment' ? 'asphalt' : 'meadow'
}

/**
 * Lawn under the house, extended well past the plot so distant haze has
 * somewhere to land. The plot itself stays inside the fog's near distance.
 */
export function createGroundLayer(ctx: SceneLayerContext): SceneLayer {
  const tile = getMaterialDef('grass')?.tileSize ?? 1.2
  const source = getMaterial({ id: 'grass' })
  const material = source.clone()
  if (material.map) {
    material.map = material.map.clone()
    material.map.colorSpace = THREE.SRGBColorSpace
    material.map.wrapS = THREE.RepeatWrapping
    material.map.wrapT = THREE.RepeatWrapping
    material.map.needsUpdate = true
  }
  if (material.roughnessMap) {
    material.roughnessMap = material.roughnessMap.clone()
    material.roughnessMap.colorSpace = THREE.NoColorSpace
    material.roughnessMap.wrapS = THREE.RepeatWrapping
    material.roughnessMap.wrapT = THREE.RepeatWrapping
    material.roughnessMap.needsUpdate = true
    material.bumpMap = material.roughnessMap
  }
  material.needsUpdate = true

  let size = 1
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.receiveShadow = true
  mesh.position.y = -0.02
  mesh.name = 'ground'
  ctx.scene.add(mesh)

  const resize = (next: number) => {
    size = next
    mesh.geometry.dispose()
    const geo = new THREE.PlaneGeometry(next, next)
    geo.rotateX(-Math.PI / 2)
    mesh.geometry = geo
    const repeat = next / tile
    material.map?.repeat.set(repeat, repeat)
    material.roughnessMap?.repeat.set(repeat, repeat)
    if (material.map) material.map.needsUpdate = true
    if (material.roughnessMap) material.roughnessMap.needsUpdate = true
  }
  resize(840)

  return {
    sync(project: Project) {
      const asphalt = distantGroundMode(project?.kind) === 'asphalt'
      mesh.visible = !asphalt
      if (asphalt || !project?.terrain) return
      const plot = Math.max(project.terrain.width, project.terrain.depth, 16)
      const next = Math.max(plot * 8, 840)
      if (Math.abs(next - size) > 0.5) resize(next)
    },
    dispose() {
      ctx.scene.remove(mesh)
      mesh.geometry.dispose()
      material.map?.dispose()
      material.roughnessMap?.dispose()
      material.dispose()
    },
  }
}

registerSceneLayer({
  id: 'ground',
  create: createGroundLayer,
})
