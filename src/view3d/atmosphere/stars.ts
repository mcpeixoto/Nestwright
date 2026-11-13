import * as THREE from 'three'

export interface StarField {
  points: THREE.Points
  setNight(amount: number): void
  dispose(): void
}

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
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: '#f7f4ea',
    size: 2.1,
    sizeAttenuation: false,
    depthWrite: false,
    fog: false,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'stars'
  points.scale.setScalar(560)
  points.frustumCulled = false
  points.visible = false
  return {
    points,
    setNight(amount) {
      points.visible = amount > 0.08
      material.opacity = Math.min(1, amount)
      material.transparent = amount < 0.98
      material.depthWrite = false
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
