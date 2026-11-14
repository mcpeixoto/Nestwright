import * as THREE from 'three'
import type { Sky } from 'three/examples/jsm/objects/Sky.js'

export interface SkyGrade {
  zenith: THREE.Color
  horizon: THREE.Color
  sunDisc: THREE.Color
}

/**
 * Replace the Preetham fragment colour. The scattering uniforms stay (they feed
 * sun direction), but ACES turns that zenith cyan, so the pixel is a graded
 * gradient whose linear values already compensate the tone map.
 */
export function gradeSkyMaterial(sky: Sky, grade: SkyGrade): void {
  const mat = sky.material as THREE.ShaderMaterial
  mat.fog = false
  const previous = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    previous?.call(mat, shader, renderer)
    shader.uniforms.uZenith = { value: grade.zenith }
    shader.uniforms.uHorizon = { value: grade.horizon }
    shader.uniforms.uSunDisc = { value: grade.sunDisc }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uZenith;\nuniform vec3 uHorizon;\nuniform vec3 uSunDisc;\nvoid main() {',
      )
      .replace(
        'gl_FragColor = vec4( texColor, 1.0 );',
        `vec3 graded = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, clamp(direction.y, 0.0, 1.0)));
         graded += uSunDisc * smoothstep(0.99955, 0.99992, cosTheta) * showSunDisc;
         gl_FragColor = vec4(graded, 1.0);`,
      )
  }
  const key = mat.customProgramCacheKey?.bind(mat)
  mat.customProgramCacheKey = () => `${key ? key() : ''}|sky-grade`
  mat.needsUpdate = true
}
