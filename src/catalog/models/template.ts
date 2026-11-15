import * as THREE from 'three'
import type { ModelBounds } from '../../model/modelFit'

/** One drawable piece of a model: baked into model space, shared by every item using it. */
export interface ModelPart {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  /** Bulb, glass shade or globe: glows when the item is a lamp that is on. */
  shade: boolean
  /** Drawn see-through; casts no shadow. */
  glass: boolean
}

export interface ModelTemplate {
  key: string
  catalogId: string
  bounds: ModelBounds
  /** Bounding-sphere radius in model space (LOD distance, probe-capture size). */
  radius: number
  lod0: ModelPart[]
  lod1: ModelPart[] | null
}

const SHADE_NAME = /bulb|glass|globe|lamp|shade/i
const GLASS_NAME = /glass/i

/** Geometry the item builds share: never disposed with one item (see disposeTree). */
const shared = new WeakSet<THREE.BufferGeometry>()

export function isSharedGeometry(geometry: THREE.BufferGeometry | undefined | null): boolean {
  return !!geometry && shared.has(geometry)
}

export function markShared(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  shared.add(geometry)
  return geometry
}

/**
 * glTF materials as the game draws them: KHR_materials_* extensions make GLTFLoader hand out
 * MeshPhysicalMaterial, whose transmission costs a whole extra scene pass in the WebGPU
 * renderer. Physical materials become standard ones; transmissive glass becomes a plain
 * transparent surface.
 */
export function gameMaterial(source: THREE.Material, key: string): { material: THREE.MeshStandardMaterial; glass: boolean } {
  const physical = source as THREE.MeshPhysicalMaterial
  let material: THREE.MeshStandardMaterial
  if (physical.isMeshPhysicalMaterial) {
    material = new THREE.MeshStandardMaterial()
    THREE.MeshStandardMaterial.prototype.copy.call(material, physical)
    material.defines = { STANDARD: '' }
  } else if ((source as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    material = source as THREE.MeshStandardMaterial
  } else {
    const basic = source as THREE.MeshBasicMaterial
    material = new THREE.MeshStandardMaterial({ color: basic.color ?? new THREE.Color('#cccccc'), map: basic.map ?? null })
    material.name = source.name
  }
  const transmissive = physical.isMeshPhysicalMaterial && (physical.transmission ?? 0) > 0.01
  const glass = transmissive || (material.transparent && GLASS_NAME.test(material.name))
  if (transmissive) {
    material.transparent = true
    material.opacity = Math.min(material.opacity, 0.28)
    material.roughness = Math.min(material.roughness, 0.1)
    material.depthWrite = false
  }
  material.userData = { ...material.userData, model: key }
  return { material, glass }
}

/**
 * Float copies of quantized attributes. Meshopt-packed files store positions as normalised
 * int16 with the scale in the node matrix; baking that matrix into an int16 attribute would
 * clamp every coordinate to ±1 (a 2 m shelf cut down to 1 m), and slicing needs room too.
 */
export function dequantize(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name)
    const interleaved = (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true
    if (!interleaved && attribute.array instanceof Float32Array && !attribute.normalized) continue
    const size = attribute.itemSize
    const out = new Float32Array(attribute.count * size)
    for (let i = 0; i < attribute.count; i++) {
      for (let c = 0; c < size; c++) out[i * size + c] = attribute.getComponent(i, c)
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, size))
  }
  return geometry
}

/**
 * Flatten a loaded glTF scene into parts with their node transforms baked in, so an item
 * (or an InstancedMesh) only needs one matrix for the whole model.
 */
export function flattenScene(
  scene: THREE.Object3D,
  key: string,
  materialFor: (source: THREE.Material) => { material: THREE.MeshStandardMaterial; glass: boolean },
): ModelPart[] {
  scene.updateMatrixWorld(true)
  const parts: ModelPart[] = []
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!source) return
    const geometry = dequantize(mesh.geometry.clone())
    geometry.applyMatrix4(mesh.matrixWorld)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const { material, glass } = materialFor(source)
    parts.push({
      name: source.name || mesh.name || key,
      geometry: markShared(geometry),
      material,
      shade: SHADE_NAME.test(source.name || ''),
      glass,
    })
  })
  return parts
}

export function partsBounds(parts: readonly ModelPart[]): { bounds: ModelBounds; radius: number } {
  const box = new THREE.Box3()
  for (const part of parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox()
    if (part.geometry.boundingBox) box.union(part.geometry.boundingBox)
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5))
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  return {
    bounds: { min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } },
    radius: sphere.radius,
  }
}

/**
 * LOD1 files carry no textures (the pipeline strips them so the pack holds one copy). Each
 * LOD1 part takes LOD0's material of the same name, maps included, which also means the two
 * LODs share one GPU program. A name with no LOD0 twin keeps its own untextured material.
 */
export function shareLod0Materials(lod1: ModelPart[], lod0: readonly ModelPart[]): ModelPart[] {
  const byName = new Map<string, ModelPart>()
  for (const part of lod0) if (!byName.has(part.material.name)) byName.set(part.material.name, part)
  return lod1.map((part) => {
    const twin = byName.get(part.material.name)
    if (!twin) return part
    if (part.material !== twin.material) part.material.dispose()
    return { ...part, material: twin.material, shade: twin.shade, glass: twin.glass }
  })
}
