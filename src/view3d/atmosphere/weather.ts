import * as THREE from 'three'

export const wetUniform = { value: 0 }
export const snowUniform = { value: 0 }

const patched = new WeakSet<THREE.Material>()

export function setWeatherMix(wet: number, snow: number): void {
  wetUniform.value = THREE.MathUtils.clamp(wet, 0, 1)
  snowUniform.value = THREE.MathUtils.clamp(snow, 0, 1)
}

/** Darken and gloss outdoor materials, and lay snow on upward faces. */
export function attachWeather(material: THREE.Material): void {
  const mat = material as THREE.MeshStandardMaterial
  if (!mat.isMeshStandardMaterial || patched.has(mat)) return
  if (mat.userData.windowGlass || mat.transparent) return
  patched.add(mat)
  const previous = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    previous?.call(mat, shader, renderer)
    shader.uniforms.uWet = wetUniform
    shader.uniforms.uSnow = snowUniform
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uWet;\nuniform float uSnow;\nvoid main() {')
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.16), clamp(uWet, 0.0, 1.0));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 worldN = inverseTransformDirection(normal, viewMatrix);
          float snowCover = smoothstep(0.45, 0.95, worldN.y) * clamp(uSnow, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.97), snowCover);
          diffuseColor.rgb *= mix(1.0, 0.62, clamp(uWet, 0.0, 1.0));
        }`,
      )
  }
  const previousKey = mat.customProgramCacheKey.bind(mat)
  mat.customProgramCacheKey = () => `${previousKey()}|wx`
  mat.needsUpdate = true
}
