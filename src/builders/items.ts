import * as THREE from 'three'
import { getEntry } from '../catalog/registry'
import { getMaterial } from '../materials/materialCache'
import type { Item } from '../model/types'
import type { MaterialRef } from '../model/types'

function tag(obj: THREE.Object3D, id: string) {
  obj.traverse((child) => {
    child.userData.entityId = id
    child.userData.kind = 'item'
  })
}

function fallback(item: Item): THREE.Object3D {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(item.size.w, item.size.h, item.size.d),
    getMaterial({ id: 'oak-planks' }),
  )
  mesh.position.y = item.size.h / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Delegates to the catalog. Unknown ids become a box so later packs still show up. */
export function buildItem(item: Item): THREE.Group {
  const root = new THREE.Group()
  root.position.set(item.position.x, item.elevation, item.position.y)
  // Plan rotation is CCW. three.js rotation.y is CCW looking down, which is the opposite
  // sense once plan +y is world +z, so the sign flips. See tools/placeItem for the pair.
  root.rotation.y = -item.rotation

  const entry = getEntry(item.catalogId)
  if (!entry) {
    root.add(fallback(item))
  } else {
    const materials: Record<string, THREE.MeshStandardMaterial> = {}
    const slots = new Set([...Object.keys(entry.materialSlots), ...Object.keys(item.materials)])
    for (const slot of slots) {
      const ref: MaterialRef = item.materials[slot] ?? entry.materialSlots[slot] ?? { id: 'plaster-white' }
      materials[slot] = getMaterial(ref)
    }
    const built = entry.build({
      size: item.size,
      materials,
      params: item.params ?? {},
    })
    if (entry.light && item.lightOn !== false) {
      const scaleY = entry.defaultSize.h > 1e-4 ? item.size.h / entry.defaultSize.h : 1
      const light = new THREE.PointLight(entry.light.color, entry.light.intensity, entry.light.distance, 2)
      light.position.y = entry.light.offsetY * scaleY
      built.add(light)
    }
    root.add(built)
  }
  tag(root, item.id)
  return root
}
