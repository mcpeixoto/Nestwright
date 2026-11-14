import * as THREE from 'three'
import { instancedBufferAttribute, uniform } from 'three/tsl'

export interface StarField {
  points: THREE.Object3D
  setNight(amount: number): void
  dispose(): void
}

// PHASE1-PORT: instanced sprite stand-in for the old sized THREE.Points.
/**
 * WebGPU draws `THREE.Points` one pixel wide, so the stars are an instanced sprite: one
 * screen-aligned quad per star, sized in pixels like the old `sizeAttenuation: false` points.
 */
export function createStars(count = 700): StarField {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const z = Math.random() * 2 - 1
    const t = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    positions[i * 3] = r * Math.cos(t)
    positions[i * 3 + 1] = Math.abs(z) * 0.85 + 0.05
    positions[i * 3 + 2] = r * Math.sin(t)
  }
  const attr = new THREE.InstancedBufferAttribute(positions, 3)
  const opacity = uniform(1)
  const material = new THREE.PointsNodeMaterial({
    color: '#f7f4ea',
    size: 2.1,
    sizeAttenuation: false,
    depthWrite: false,
    transparent: true,
    fog: false,
  })
  material.positionNode = instancedBufferAttribute(attr)
  material.opacityNode = opacity
  const points = new THREE.Sprite(material)
  points.count = count
  points.name = 'stars'
  points.scale.setScalar(560)
  points.frustumCulled = false
  points.visible = false
  return {
    points,
    setNight(amount) {
      points.visible = amount > 0.08
      opacity.value = Math.min(1, amount)
    },
    dispose() {
      material.dispose()
    },
  }
}
