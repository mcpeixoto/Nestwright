import * as THREE from 'three'

/**
 * RGBA8 byte estimate. A full mip chain is the geometric series 1 + 1/4 + … = 4/3.
 * `faces` is 6 for a cube map and 1 for a 2D image, canvas, or data texture.
 */
export function textureByteSize(width: number, height: number, mipmapped: boolean, faces = 1): number {
  if (!(width > 0) || !(height > 0) || !(faces > 0)) return 0
  const base = width * height * 4 * faces
  return mipmapped ? (base * 4) / 3 : base
}

const MIP_MIN = new Set<THREE.MinificationTextureFilter>([
  THREE.LinearMipmapLinearFilter,
  THREE.LinearMipmapNearestFilter,
  THREE.NearestMipmapLinearFilter,
  THREE.NearestMipmapNearestFilter,
])

function mipmapped(tex: THREE.Texture): boolean {
  if (tex.generateMipmaps === false) return Array.isArray(tex.mipmaps) && tex.mipmaps.length > 1
  return MIP_MIN.has(tex.minFilter)
}

function sizeOf(tex: THREE.Texture): { width: number; height: number; faces: number } | null {
  const image: unknown = tex.image
  if (Array.isArray(image)) {
    const face = image[0] as { width?: number; height?: number } | undefined
    if (!face || !(face.width && face.width > 0) || !(face.height && face.height > 0)) return null
    return { width: face.width, height: face.height, faces: image.length }
  }
  if (image && typeof image === 'object') {
    const sized = image as { width?: number; height?: number }
    if (sized.width && sized.height && sized.width > 0 && sized.height > 0) {
      return { width: sized.width, height: sized.height, faces: 1 }
    }
  }
  return null
}

function geometryBytes(geometry: THREE.BufferGeometry): number {
  let bytes = 0
  for (const attr of Object.values(geometry.attributes)) {
    const array = attr.array as ArrayBufferView | undefined
    if (array && typeof array.byteLength === 'number') bytes += array.byteLength
  }
  const index = geometry.index?.array as ArrayBufferView | undefined
  if (index && typeof index.byteLength === 'number') bytes += index.byteLength
  return bytes
}

const seenTextures = new Set<THREE.Texture>()
const seenGeometries = new Set<THREE.BufferGeometry>()

function addTexture(bytes: { n: number }, tex: THREE.Texture | null | undefined): void {
  if (!tex?.isTexture || seenTextures.has(tex)) return
  seenTextures.add(tex)
  const size = sizeOf(tex)
  if (!size) return
  bytes.n += textureByteSize(size.width, size.height, mipmapped(tex), size.faces)
}

function addMaterial(bytes: { n: number }, material: THREE.Material | null | undefined): void {
  if (!material) return
  const record = material as unknown as Record<string, unknown>
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) addTexture(bytes, value as THREE.Texture)
  }
  const uniforms = (material as THREE.ShaderMaterial).uniforms
  if (!uniforms) return
  for (const uniform of Object.values(uniforms)) {
    const value = uniform?.value as unknown
    if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) addTexture(bytes, value as THREE.Texture)
  }
}

export interface GpuScene extends THREE.Object3D {
  environment?: THREE.Texture | null
  background?: unknown
}

/** Texture bytes (image / canvas / data, mip chain included) plus geometry attribute and index bytes. */
export function estimateGpuBytes(scene: GpuScene): number {
  seenTextures.clear()
  seenGeometries.clear()
  const bytes = { n: 0 }
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry?.isBufferGeometry && !seenGeometries.has(mesh.geometry)) {
      seenGeometries.add(mesh.geometry)
      bytes.n += geometryBytes(mesh.geometry)
    }
    const material = mesh.material
    if (Array.isArray(material)) {
      for (const item of material) addMaterial(bytes, item)
    } else {
      addMaterial(bytes, material)
    }
    const shadow = (obj as { shadow?: { map?: { texture?: THREE.Texture } | null } }).shadow
    if (shadow?.map?.texture) addTexture(bytes, shadow.map.texture)
  })
  if (scene.environment) addTexture(bytes, scene.environment)
  const background = scene.background
  if (background && typeof background === 'object' && (background as THREE.Texture).isTexture) {
    addTexture(bytes, background as THREE.Texture)
  }
  return bytes.n
}
