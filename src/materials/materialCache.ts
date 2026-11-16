import * as THREE from 'three'
import type { MaterialRef } from '../model/types'
import { getMaterialDef, type MaterialDef } from './library'
import { albedoTint, loadPbrMaps, pbrScalars, type PbrMaps } from './pbrTextures'
import { getPatternTextures } from './textures'
import { reflectRoom } from '../view3d/lighting/reflectionProbe'
import { attachFacadeWeathering } from './facadeWeathering'

const cache = new Map<string, THREE.MeshStandardMaterial>()
/** Cache key of every material this module handed out, so an outdoor twin can be found from a mesh. */
const keys = new WeakMap<THREE.Material, string>()

export interface MaterialOptions {
  /**
   * A separate instance for meshes outside the house (roofs, ground, outdoor items). Weather
   * nodes go on this twin only, so the same library material indoors stays dry.
   */
  outdoor?: boolean
  /**
   * An outdoor twin that also weathers (grime, rain streaks, colour drift) for the exterior
   * faces of walls. Needs the `weather` vertex attribute (see facadeWeathering).
   */
  facade?: boolean
}

const OUTDOOR_SUFFIX = '|outdoor'
// Ends in OUTDOOR_SUFFIX: a facade twin is an outdoor twin, so weather and outdoor lights take it.
const FACADE_SUFFIX = '|facade' + OUTDOOR_SUFFIX

export function materialCacheKey(ref: MaterialRef | undefined, options?: MaterialOptions): string {
  const id = ref?.id || 'plaster-white'
  const tint = ref?.tint ?? ''
  const scale = ref?.scale && ref.scale > 0 ? ref.scale : 1
  const suffix = options?.facade ? FACADE_SUFFIX : options?.outdoor ? OUTDOOR_SUFFIX : ''
  return `${id}|${tint}|${scale}${suffix}`
}

function baseKey(key: string): string {
  if (key.endsWith(FACADE_SUFFIX)) return key.slice(0, -FACADE_SUFFIX.length)
  if (key.endsWith(OUTDOOR_SUFFIX)) return key.slice(0, -OUTDOOR_SUFFIX.length)
  return key
}

/** True for a material from this cache (shared; callers must not dispose or patch it in place). */
export function isCachedMaterial(material: THREE.Material | null | undefined): boolean {
  return !!material && keys.has(material)
}

/** True for an outdoor twin handed out by `getMaterial(ref, { outdoor: true })`. */
export function isOutdoorMaterial(material: THREE.Material | null | undefined): boolean {
  return !!material && (keys.get(material)?.endsWith(OUTDOOR_SUFFIX) ?? false)
}

/**
 * The outdoor twin of a cached library material. A material this cache did not create is
 * returned as it is: it belongs to one mesh, so patching it cannot leak indoors.
 */
export function outdoorVariant<T extends THREE.Material>(material: T): T | THREE.MeshStandardMaterial {
  const key = keys.get(material)
  if (key === undefined || key.endsWith(OUTDOOR_SUFFIX)) return material
  return twinOf(material, key + OUTDOOR_SUFFIX)
}

/**
 * The weathered outdoor twin of a cached library material, for exterior wall faces. A material
 * this cache did not create is returned as it is.
 */
export function facadeVariant<T extends THREE.Material>(material: T): T | THREE.MeshStandardMaterial {
  const key = keys.get(material)
  if (key === undefined || key.endsWith(FACADE_SUFFIX)) return material
  const twin = twinOf(material, baseKey(key) + FACADE_SUFFIX)
  attachFacadeWeathering(twin)
  return twin
}

function twinOf(material: THREE.Material, twinKey: string): THREE.MeshStandardMaterial {
  const hit = cache.get(twinKey)
  if (hit) return hit
  const original = cache.get(baseKey(twinKey)) ?? (material as unknown as THREE.MeshStandardMaterial)
  const twin = original.clone()
  twin.userData = { ...original.userData, outdoor: true }
  // Outdoors reflects the sky, never the camera's room (clone() does not copy envNode anyway).
  ;(twin as THREE.MeshStandardMaterial & { envNode?: unknown }).envNode = null
  cache.set(twinKey, twin)
  keys.set(twin, twinKey)
  // A twin cloned before the scan arrived still has the procedural maps; give it its own swap.
  const source = pbrSources.get(original)
  if (source) requestPbr(twin, source)
  return twin
}

interface PbrSource {
  def: MaterialDef
  scale: number
  tint: string
  /** Roughness / metalness the material should average to, after per-id overrides. */
  roughness: number
  metalness: number
}

const pbrSources = new WeakMap<THREE.Material, PbrSource>()
/** Glass and mirrors stay analytic: a scan would only fight their opacity and reflection. */
const NO_SCAN = new Set(['glass', 'frosted-glass', 'mirror'])

/** Node slots three's WebGPU build reads off a classic material when it converts it. */
type NodeSlots = THREE.MeshStandardMaterial & { normalNode?: THREE.Node | null }

function mapSignature(mat: THREE.MeshStandardMaterial): string {
  const nodes = mat as NodeSlots
  return [mat.map, mat.normalMap, nodes.normalNode, mat.roughnessMap, mat.metalnessMap, mat.aoMap, mat.bumpMap]
    .map((m) => (m ? 1 : 0))
    .join('')
}

/**
 * Swap the scanned maps into `mat` in place. False (material untouched) when the scan is too
 * far from the library colour to tint (see `albedoTint`). Exported for tests.
 */
export function applyPbrMaps(mat: THREE.MeshStandardMaterial, source: PbrSource, maps: PbrMaps): boolean {
  const color = albedoTint(source.def.color, maps.info.meanAlbedoSrgb)
  if (!color) return false
  if (source.tint) color.multiply(new THREE.Color(source.tint))
  const before = mapSignature(mat)
  const scalars = pbrScalars(source.roughness, source.metalness, maps.info.meanOrm)
  mat.map = maps.albedo
  mat.color.copy(color)
  // The scan's normal is two-channel (see PbrMaps.normalNode); normalMap would read it as XYZ.
  mat.normalMap = null
  ;(mat as NodeSlots).normalNode = maps.normalNode
  mat.bumpMap = null
  mat.bumpScale = 1
  mat.roughness = scalars.roughness
  mat.roughnessMap = maps.orm && scalars.roughnessMap ? maps.orm : null
  mat.metalness = scalars.metalness
  mat.metalnessMap = maps.orm && scalars.metalnessMap ? maps.orm : null
  mat.aoMap = maps.orm && scalars.aoMap ? maps.orm : null
  if (!mat.roughnessMap) mat.roughness = source.roughness
  if (!mat.metalnessMap) mat.metalness = source.metalness
  mat.userData = { ...mat.userData, scanned: maps.info.key }
  // Only a different set of maps needs a new program; the same set is a uniform update.
  if (mapSignature(mat) !== before) mat.needsUpdate = true
  return true
}

function requestPbr(mat: THREE.MeshStandardMaterial, source: PbrSource): void {
  pbrSources.set(mat, source)
  void loadPbrMaps(source.def.id, source.scale).then((maps) => {
    if (maps) applyPbrMaps(mat, source, maps)
  })
}

/**
 * Shared standard material. UVs are in metres, so the texture repeats every
 * `tileSize / scale` — one tile of the library art covers `tileSize` metres
 * at scale 1. Tint multiplies the colour (or the texture, when one exists).
 */
export function getMaterial(ref: MaterialRef | undefined, options?: MaterialOptions): THREE.MeshStandardMaterial {
  if (options?.facade) return facadeVariant(getMaterial(ref)) as THREE.MeshStandardMaterial
  if (options?.outdoor) return outdoorVariant(getMaterial(ref)) as THREE.MeshStandardMaterial
  const id = ref?.id || 'plaster-white'
  const tint = ref?.tint ?? ''
  const scale = ref?.scale && ref.scale > 0 ? ref.scale : 1
  const key = materialCacheKey(ref)
  const hit = cache.get(key)
  if (hit) return hit

  const def = getMaterialDef(id) ?? getMaterialDef('plaster-white')
  const mat = new THREE.MeshStandardMaterial({
    roughness: def?.roughness ?? 0.8,
    metalness: def?.metalness ?? 0,
  })
  const maps = def ? getPatternTextures(def.id) : null
  if (maps && def) {
    const color = maps.color.clone()
    color.wrapS = THREE.RepeatWrapping
    color.wrapT = THREE.RepeatWrapping
    color.colorSpace = THREE.SRGBColorSpace
    const repeat = scale / def.tileSize
    color.repeat.set(repeat, repeat)
    const rough = maps.rough.clone()
    rough.wrapS = THREE.RepeatWrapping
    rough.wrapT = THREE.RepeatWrapping
    rough.colorSpace = THREE.NoColorSpace
    rough.repeat.set(repeat, repeat)
    mat.map = color
    mat.roughnessMap = rough
    mat.bumpMap = rough
    mat.bumpScale = 0.008
    mat.color.set(tint || '#ffffff')
    color.needsUpdate = true
    rough.needsUpdate = true
    mat.needsUpdate = true
  } else {
    const color = new THREE.Color(def?.color ?? '#f4f1ea')
    if (tint) color.multiply(new THREE.Color(tint))
    mat.color.copy(color)
  }
  if (id === 'glass' || id === 'frosted-glass') {
    mat.transparent = true
    mat.opacity = id === 'frosted-glass' ? 0.5 : 0.28
    mat.roughness = id === 'frosted-glass' ? 0.65 : 0.05
    mat.metalness = 0
    mat.depthWrite = false
    mat.bumpMap = null
    mat.bumpScale = 0
  }
  if (id === 'roof-tiles') {
    mat.metalness = 0
    mat.roughness = Math.max(mat.roughness, 0.82)
    // No envMapIntensity: without a material envMap, three scales the scene environment by
    // scene.environmentIntensity and ignores it (MaterialProperties materialEnvIntensity).
    mat.bumpScale = 0.04
  }
  if (id === 'mirror') {
    mat.roughness = 0.02
    mat.metalness = 1
    mat.bumpMap = null
    mat.bumpScale = 0
  }
  // The scalar multiplies the rough map, so divide by the map's mean: otherwise the grey
  // canvas (≈0.5) halves every material's roughness and plaster reads as satin.
  const target = { roughness: mat.roughness, metalness: mat.metalness }
  if (maps && mat.roughnessMap) mat.roughness = target.roughness / maps.roughMean
  // Indoor instance: reflects the camera's room capture instead of the sky (see reflectionProbe).
  reflectRoom(mat)
  cache.set(key, mat)
  keys.set(mat, key)
  mat.needsUpdate = true
  if (def && !NO_SCAN.has(def.id)) requestPbr(mat, { def, scale, tint, ...target })
  return mat
}
