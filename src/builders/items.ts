import * as THREE from 'three'
import { buildModel, modelFor } from '../catalog/models'
import { occupy } from '../catalog/parts'
import { getEntry } from '../catalog/registry'
import type { CatalogEntry } from '../catalog/types'
import { getMaterial } from '../materials/materialCache'
import { kelvinToLinear, LAMP_SCENE_GAIN, lampOutput, pointCandela, spotCandela } from '../model/light'
import type { Item, MaterialRef } from '../model/types'
import { metricUVs } from './uv'

function tag(obj: THREE.Object3D, id: string) {
  obj.traverse((child) => {
    child.userData.entityId = id
    child.userData.kind = 'item'
  })
}

function fallback(item: Item): THREE.Object3D {
  const mesh = new THREE.Mesh(
    metricUVs(new THREE.BoxGeometry(item.size.w, item.size.h, item.size.d)),
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
  const template = entry ? modelFor(item.catalogId) : null
  if (!entry) {
    root.add(fallback(item))
  } else if (template) {
    // Scanned model: its own materials (the item's material picks do not apply).
    const built = new THREE.Group()
    built.add(buildModel(template, item.size, !!entry.light))
    occupy(built, item.size)
    if (entry.light) tuneLamp(built, item, entry)
    root.add(built)
    root.userData.scanned = template.key
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
    if (entry.light) tuneLamp(built, item, entry)
    root.add(built)
  }
  tag(root, item.id)
  return root
}

function tuneLamp(built: THREE.Object3D, item: Item, entry: CatalogEntry): void {
  const spec = entry.light
  if (!spec) return
  const on = item.lightOn !== false
  const output = lampOutput(item, spec)
  const [r, g, b] = kelvinToLinear(output.kelvin)
  // Luminance-1 light colour; the shade glows in the same colour, normalised to its brightest channel.
  const color = new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)
  const peak = Math.max(r, g, b, 1e-6)
  const glow = new THREE.Color().setRGB(r / peak, g / peak, b / peak, THREE.LinearSRGBColorSpace)
  // A dimmed lamp's shade glows less too; full glow from ~800 lm.
  const glowScale = Math.min(1, Math.sqrt(output.lumens / 800))
  built.traverse((child) => {
    if (!child.userData.shade) return
    const mesh = child as THREE.Mesh
    const source = mesh.material
    if (!(source instanceof THREE.MeshStandardMaterial)) return
    const next = source.clone()
    next.userData.owned = true
    if (on) {
      next.emissive = glow.clone()
      next.emissiveIntensity = 0.65 * glowScale
    } else {
      next.emissive = new THREE.Color('#000000')
      next.emissiveIntensity = 0
    }
    mesh.material = next
    if (source.userData?.owned) source.dispose()
  })
  if (!on) return
  const scaleY = entry.defaultSize.h > 1e-4 ? item.size.h / entry.defaultSize.h : 1
  if (spec.spot) {
    const angle = spec.angle ?? Math.PI / 5
    const intensity = spotCandela(output.lumens, angle) * LAMP_SCENE_GAIN
    const spot = new THREE.SpotLight(color, intensity, spec.distance, angle, 0.45, 2)
    spot.position.y = spec.offsetY * scaleY
    spot.castShadow = false
    spot.userData.lampLight = true
    const target = new THREE.Object3D()
    target.position.set(0, 0, 0)
    built.add(spot)
    built.add(target)
    spot.target = target
    return
  }
  const light = new THREE.PointLight(color, pointCandela(output.lumens) * LAMP_SCENE_GAIN, spec.distance, 2)
  light.position.y = spec.offsetY * scaleY
  light.castShadow = false
  light.userData.lampLight = true
  built.add(light)
}
