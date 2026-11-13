import * as THREE from 'three'
import type { Project } from '../../model/types'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext } from '../layers'

const BLOCKS: readonly { x: number; z: number; w: number; d: number; h: number; sand: boolean }[] = [
  { x: -55, z: -40, w: 18, d: 14, h: 28, sand: false },
  { x: -36, z: -48, w: 12, d: 16, h: 16, sand: true },
  { x: 42, z: -46, w: 20, d: 12, h: 34, sand: false },
  { x: 58, z: -22, w: 10, d: 14, h: 18, sand: true },
  { x: -62, z: 18, w: 16, d: 18, h: 22, sand: false },
  { x: -40, z: 36, w: 22, d: 10, h: 12, sand: true },
  { x: 36, z: 40, w: 14, d: 20, h: 26, sand: false },
  { x: 60, z: 24, w: 12, d: 12, h: 40, sand: false },
  { x: 8, z: -58, w: 24, d: 10, h: 14, sand: true },
  { x: -8, z: 56, w: 18, d: 12, h: 20, sand: false },
]

export function createCityLayer(ctx: SceneLayerContext): SceneLayer {
  const group = new THREE.Group()
  group.name = 'city'
  group.visible = false
  const streetGeo = new THREE.PlaneGeometry(1, 1)
  const streetMat = new THREE.MeshStandardMaterial({ color: '#3c4348', roughness: 0.96 })
  const street = new THREE.Mesh(streetGeo, streetMat)
  street.rotation.x = -Math.PI / 2
  street.position.y = -0.04
  street.receiveShadow = true
  group.add(street)
  const slate = new THREE.MeshStandardMaterial({ color: '#6d757b', roughness: 0.88 })
  const sand = new THREE.MeshStandardMaterial({ color: '#c4a574', roughness: 0.8 })
  const geos: THREE.BufferGeometry[] = [streetGeo]
  for (const block of BLOCKS) {
    const geo = new THREE.BoxGeometry(Math.max(1, block.w), Math.max(1, block.h), Math.max(1, block.d))
    geos.push(geo)
    const mesh = new THREE.Mesh(geo, block.sand ? sand : slate)
    mesh.position.set(block.x, block.h / 2, block.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  ctx.scene.add(group)

  return {
    sync(project: Project) {
      const apartment = project?.kind === 'apartment'
      group.visible = apartment
      if (!apartment) return
      const span = Math.max(project.terrain?.width || 0, project.terrain?.depth || 0, 24) * 8
      const size = Math.max(160, Math.min(420, span))
      street.scale.set(size, size, 1)
    },
    dispose() {
      ctx.scene.remove(group)
      for (const geo of geos) geo.dispose()
      streetMat.dispose()
      slate.dispose()
      sand.dispose()
    },
  }
}

registerSceneLayer({
  id: 'city',
  create: createCityLayer,
})
