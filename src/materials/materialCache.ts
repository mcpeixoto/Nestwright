import * as THREE from 'three'
import type { MaterialRef } from '../model/types'
import { getMaterialDef } from './library'
import { getPatternTextures } from './textures'

const cache = new Map<string, THREE.MeshStandardMaterial>()

/**
 * Shared standard material. UVs are in metres, so the texture repeats every
 * `tileSize / scale` — one tile of the library art covers `tileSize` metres
 * at scale 1. Tint multiplies the colour (or the texture, when one exists).
 */
export function getMaterial(ref: MaterialRef | undefined): THREE.MeshStandardMaterial {
  const id = ref?.id || 'plaster-white'
  const tint = ref?.tint ?? ''
  const scale = ref?.scale && ref.scale > 0 ? ref.scale : 1
  const key = `${id}|${tint}|${scale}`
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
    mat.envMapIntensity = 0.15
    mat.bumpScale = 0.04
  }
  if (id === 'mirror') {
    mat.roughness = 0.02
    mat.metalness = 1
    mat.bumpMap = null
    mat.bumpScale = 0
  }
  cache.set(key, mat)
  mat.needsUpdate = true
  return mat
}
