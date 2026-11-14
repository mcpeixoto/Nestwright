import * as THREE from 'three'
import { clamp, float, materialColor, materialRoughness, min, mix, normalWorld, smoothstep, uniform, vec3, vec4 } from 'three/tsl'

/** Shared by every outdoor material. Same `{ value }` shape as the old GLSL uniforms. */
export const wetUniform = uniform(0)
export const snowUniform = uniform(0)

const patched = new WeakSet<THREE.Material>()

export function setWeatherMix(wet: number, snow: number): void {
  wetUniform.value = THREE.MathUtils.clamp(wet, 0, 1)
  snowUniform.value = THREE.MathUtils.clamp(snow, 0, 1)
}

/** Node slots a plain material also carries: WebGPURenderer copies them onto its node twin. */
interface NodeSlots {
  colorNode: THREE.Node | null
  roughnessNode: THREE.Node | null
}

// PHASE1-PORT: snow cover reads the geometric world normal (the GLSL used the normal-mapped
// one), and shared library materials still carry the weather indoors (plan 1c fixes the keying).
/**
 * Darken and gloss outdoor materials, and lay snow on upward faces. Wraps whatever colour and
 * roughness the material already has (the ground splat sets its own colorNode).
 */
export function attachWeather(material: THREE.Material): void {
  const mat = material as THREE.MeshStandardMaterial & Partial<NodeSlots>
  if (!mat.isMeshStandardMaterial || patched.has(mat)) return
  if (mat.userData.windowGlass || mat.transparent) return
  patched.add(mat)
  const baseColor = (mat.colorNode ?? materialColor) as THREE.Node<'vec4'>
  const baseRough = (mat.roughnessNode ?? materialRoughness) as THREE.Node<'float'>
  const wet = clamp(wetUniform, 0.0, 1.0)
  const snowCover = smoothstep(0.45, 0.95, normalWorld.y).mul(clamp(snowUniform, 0.0, 1.0))
  const base = vec4(baseColor)
  const snowed = mix(base.rgb, vec3(0.93, 0.95, 0.97), snowCover).mul(mix(float(1.0), float(0.62), wet))
  mat.colorNode = vec4(snowed, base.a)
  mat.roughnessNode = mix(baseRough, min(baseRough, 0.16), wet)
  mat.needsUpdate = true
}
