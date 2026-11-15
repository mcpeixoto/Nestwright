import * as THREE from 'three'
import { axisSlope, fitKey, fitModel, mapAxis, type ModelFit } from '../../model/modelFit'
import { markShared, type ModelPart, type ModelTemplate } from './template'

/**
 * Sliced copies of a part's geometry, by template, LOD, part and fit. Items of the same size
 * share one; a copy nobody uses is freed when the last item holding it is disposed.
 */
const sliced = new Map<string, { geometry: THREE.BufferGeometry; refs: number }>()
const slicedKeys = new WeakMap<THREE.BufferGeometry, string>()

/** Bend positions, normals and tangents of `source` through a slice fit. */
export function sliceGeometry(source: THREE.BufferGeometry, fit: Extract<ModelFit, { kind: 'slice' }>): THREE.BufferGeometry {
  const geometry = source.clone()
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!position) return geometry
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  const tangent = geometry.getAttribute('tangent') as THREE.BufferAttribute | undefined
  const v = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const sx = axisSlope(fit.x, x)
    const sy = axisSlope(fit.y, y)
    const sz = axisSlope(fit.z, z)
    position.setXYZ(i, mapAxis(fit.x, x), mapAxis(fit.y, y), mapAxis(fit.z, z))
    // Normals take the inverse-transpose of the local stretch; tangents the stretch itself.
    if (normal) {
      v.set(normal.getX(i) / sx, normal.getY(i) / sy, normal.getZ(i) / sz).normalize()
      normal.setXYZ(i, v.x, v.y, v.z)
    }
    if (tangent) {
      v.set(tangent.getX(i) * sx, tangent.getY(i) * sy, tangent.getZ(i) * sz).normalize()
      tangent.setXYZ(i, v.x, v.y, v.z)
    }
  }
  position.needsUpdate = true
  if (normal) normal.needsUpdate = true
  if (tangent) tangent.needsUpdate = true
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function slicedPart(template: ModelTemplate, lod: number, index: number, part: ModelPart, fit: Extract<ModelFit, { kind: 'slice' }>, key: string): THREE.BufferGeometry {
  const id = `${template.key}|${lod}|${index}|${key}`
  let hit = sliced.get(id)
  if (!hit) {
    const geometry = markShared(sliceGeometry(part.geometry, fit))
    hit = { geometry, refs: 0 }
    sliced.set(id, hit)
    slicedKeys.set(geometry, id)
  }
  hit.refs += 1
  return hit.geometry
}

/**
 * Called by whoever drops a mesh built here. A sliced copy is freed with its last user; a
 * template's own geometry lives as long as the template.
 */
export function releaseModelGeometry(geometry: THREE.BufferGeometry): void {
  const id = slicedKeys.get(geometry)
  if (!id) return
  const hit = sliced.get(id)
  if (!hit) return
  hit.refs -= 1
  if (hit.refs > 0) return
  sliced.delete(id)
  geometry.dispose()
}

/** Take one more reference on a geometry handed out by `buildModel` (an InstancedMesh copy). */
export function retainModelGeometry(geometry: THREE.BufferGeometry): void {
  const id = slicedKeys.get(geometry)
  const hit = id ? sliced.get(id) : undefined
  if (hit) hit.refs += 1
}

export interface ModelInfo {
  key: string
  /** Same key + fit: the items can share one InstancedMesh per part. */
  instanceKey: string
  radius: number
  /** Built for a lamp: shade materials are per item, so it is never instanced. */
  lamp: boolean
}

function lodGroup(template: ModelTemplate, parts: readonly ModelPart[], lod: number, fit: ModelFit, key: string, lamp: boolean): THREE.Group {
  const group = new THREE.Group()
  group.name = `lod${lod}`
  group.userData.lod = lod
  if (fit.kind === 'uniform') {
    group.scale.setScalar(fit.scale)
    group.position.set(fit.offset.x, fit.offset.y, fit.offset.z)
  }
  parts.forEach((part, index) => {
    const geometry = fit.kind === 'slice' ? slicedPart(template, lod, index, part, fit, key) : part.geometry
    const mesh = new THREE.Mesh(geometry, part.material)
    mesh.name = part.name
    mesh.castShadow = !part.glass
    mesh.receiveShadow = true
    mesh.userData.modelPart = index
    if (part.glass) mesh.renderOrder = 1
    if (lamp && part.shade) mesh.userData.shade = true
    group.add(mesh)
  })
  return group
}

/**
 * The scanned model fitted into an item box, as `lod0` and (hidden) `lod1` groups. Meshes
 * share the template's materials and, for a uniform fit, its geometry.
 */
export function buildModel(template: ModelTemplate, size: { w: number; d: number; h: number }, lamp = false): THREE.Group {
  const fit = fitModel(template.bounds, size)
  const key = fitKey(fit)
  const root = new THREE.Group()
  root.name = 'model'
  const info: ModelInfo = {
    key: template.key,
    instanceKey: `${template.key}|${key}`,
    radius: fit.kind === 'uniform' ? template.radius * fit.scale : Math.hypot(size.w, size.d, size.h) / 2,
    lamp,
  }
  root.userData.model = info
  root.add(lodGroup(template, template.lod0, 0, fit, key, lamp))
  if (template.lod1) {
    const far = lodGroup(template, template.lod1, 1, fit, key, lamp)
    far.visible = false
    root.add(far)
  }
  return root
}
