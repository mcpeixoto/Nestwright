import * as THREE from 'three'
import { cameraPosition, clamp, mix, positionWorld, smoothstep, uniform, vec4 } from 'three/tsl'

export interface SkyGrade {
  zenith: THREE.Color
  horizon: THREE.Color
  sunDisc: THREE.Color
}

export interface GradedSky {
  mesh: THREE.Mesh
  /** Unit vector towards the sun; write into it. */
  sunDirection: THREE.Vector3
  setShowSun(show: boolean): void
  dispose(): void
}

// PHASE1-PORT: like-for-like port of the graded Preetham sky; the ACES-fitted colours in
// skyParams.ts need a refit when tone mapping moves to Neutral (plan 1c).
/**
 * The sky dome. Under WebGL this was three's Preetham `Sky` with its fragment colour
 * replaced; only the sun direction survived from the scattering model. ACES turns the
 * physical zenith cyan, so the pixel is a graded gradient whose linear values already
 * compensate the tone map, plus a hard sun disc. Same maths as before, as a node material.
 */
export function createGradedSky(grade: SkyGrade): GradedSky {
  const sunDirection = new THREE.Vector3(0.35, 0.78, 0.25).normalize()
  const uZenith = uniform(grade.zenith)
  const uHorizon = uniform(grade.horizon)
  const uSunDisc = uniform(grade.sunDisc)
  const uSun = uniform(sunDirection)
  const uShowSun = uniform(1)
  const direction = positionWorld.sub(cameraPosition).normalize()
  const cosTheta = direction.dot(uSun)
  const graded = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, clamp(direction.y, 0.0, 1.0))).add(
    uSunDisc.mul(smoothstep(0.99955, 0.99992, cosTheta)).mul(uShowSun),
  )
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
  material.colorNode = vec4(graded, 1)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  return {
    mesh,
    sunDirection,
    setShowSun(show) {
      uShowSun.value = show ? 1 : 0
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
