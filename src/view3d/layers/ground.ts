import * as THREE from 'three'
import { metricUVs } from '../../builders/uv'
import { getMaterial } from '../../materials/materialCache'
import type { Project } from '../../model/types'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext } from '../layers'

/** Houses sit in a meadow. Apartment blocks sit on asphalt, with the city layer behind them. */
export function distantGroundMode(kind: string | undefined): 'meadow' | 'asphalt' {
  return kind === 'apartment' ? 'asphalt' : 'meadow'
}

/** The lawn material for flat ground planes: the cached outdoor grass, scanned once loaded. */
export function groundMaterial(): THREE.MeshStandardMaterial {
  return getMaterial({ id: 'grass' }, { outdoor: true })
}

/**
 * Lawn under the house, extended well past the plot so distant haze has
 * somewhere to land. The plot itself stays inside the fog's near distance.
 */
export function createGroundLayer(ctx: SceneLayerContext): SceneLayer {
  // The shared outdoor lawn, not a clone: a clone taken before the content pack loads keeps the
  // procedural art forever, while the cached material swaps the scan in when it arrives.
  const material = groundMaterial()

  let size = 1
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.receiveShadow = true
  mesh.position.y = -0.02
  mesh.name = 'ground'
  ctx.scene.add(mesh)

  const resize = (next: number) => {
    size = next
    mesh.geometry.dispose()
    // Metric UVs, so the cloned maps keep the library's 1/tileSize repeat at any plane size.
    const geo = metricUVs(new THREE.PlaneGeometry(next, next))
    geo.rotateX(-Math.PI / 2)
    mesh.geometry = geo
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
      // The material belongs to the material cache.
      mesh.geometry.dispose()
    },
  }
}

registerSceneLayer({
  id: 'ground',
  create: createGroundLayer,
})
