import * as THREE from 'three'
import { attribute, cameraPosition, mix, mod, sin, uniform, vec3 } from 'three/tsl'
import type { Weather } from '../../model/types'
import type { GraphicsQuality } from '../../settings'

const RAIN = 1800
const SNOW = 900

export interface Precip {
  group: THREE.Group
  set(weather: Weather, density: number, quality: GraphicsQuality): void
  dispose(): void
}

interface Streaks {
  lines: THREE.LineSegments
  time: { value: number }
  drift: { value: number }
  streak: { value: number }
  color: THREE.Color
  alpha: { value: number }
}

function build(count: number, name: string): Streaks {
  const positions = new Float32Array(count * 2 * 3)
  const offsets = new Float32Array(count * 2 * 3)
  const speeds = new Float32Array(count * 2)
  const ends = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const ox = (Math.random() - 0.5) * 28
    const oy = Math.random() * 22
    const oz = (Math.random() - 0.5) * 28
    const speed = 4 + Math.random() * 6
    for (let end = 0; end < 2; end++) {
      const v = i * 2 + end
      offsets[v * 3] = ox
      offsets[v * 3 + 1] = oy
      offsets[v * 3 + 2] = oz
      speeds[v] = speed
      ends[v] = end
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3))
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1))
  const uTime = uniform(0)
  const uSpan = uniform(22)
  const uDrift = uniform(0)
  const uStreak = uniform(0.7)
  const color = new THREE.Color('#d5e4ee')
  const uAlpha = uniform(0.45)
  const aOffset = attribute<'vec3'>('aOffset', 'vec3')
  const aSpeed = attribute<'float'>('aSpeed', 'float')
  const aEnd = attribute<'float'>('aEnd', 'float')
  // The group sits at the origin, so local space is world space, as in the old shader.
  const cycle = mod(aOffset.y.sub(uTime.mul(aSpeed)), uSpan)
  const y = cycle.sub(uSpan.mul(0.5))
  const drift = sin(uTime.mul(0.4).add(aOffset.x)).mul(uDrift)
  const head = cameraPosition.add(vec3(aOffset.x.add(drift), y, aOffset.z))
  const tail = head.add(vec3(drift.mul(0.15), uStreak, 0.02))
  const material = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
  material.positionNode = mix(head, tail, aEnd)
  material.colorNode = uniform(color)
  material.opacityNode = uAlpha
  const lines = new THREE.LineSegments(geometry, material)
  lines.name = name
  lines.frustumCulled = false
  lines.visible = false
  lines.userData.precipTime = uTime
  return { lines, time: uTime, drift: uDrift, streak: uStreak, color, alpha: uAlpha }
}

function budget(quality: GraphicsQuality, full: number): number {
  if (quality === 'low') return Math.round(full * 0.25)
  if (quality === 'medium') return Math.round(full * 0.55)
  if (quality === 'ultra') return full
  return Math.round(full * 0.8)
}

// PHASE1-PORT: like-for-like TSL port of the rain/snow streaks (1 px lines, as before).
export function createPrecip(): Precip {
  const group = new THREE.Group()
  group.name = 'precip'
  const rain = build(RAIN, 'rain')
  const snow = build(SNOW, 'snow')
  group.add(rain.lines)
  group.add(snow.lines)
  return {
    group,
    set(weather, density, quality) {
      const rainOn = weather === 'rain'
      const snowOn = weather === 'snow'
      rain.lines.visible = rainOn
      snow.lines.visible = snowOn
      rain.drift.value = 0.05
      rain.streak.value = 0.85
      rain.color.set('#c5d7e4')
      rain.alpha.value = 0.35 + density * 0.25
      snow.drift.value = 0.8
      snow.streak.value = 0.08
      snow.color.set('#f7f8fa')
      snow.alpha.value = 0.55 + density * 0.3
      const rainCount = budget(quality, RAIN)
      const snowCount = budget(quality, SNOW)
      rain.lines.geometry.setDrawRange(0, rainOn ? rainCount * 2 : 0)
      snow.lines.geometry.setDrawRange(0, snowOn ? snowCount * 2 : 0)
    },
    dispose() {
      for (const child of [rain.lines, snow.lines]) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    },
  }
}

export function driftPrecip(group: THREE.Group, elapsed: number): void {
  group.traverse((obj) => {
    const slot = obj.userData.precipTime as { value: number } | undefined
    if (slot) slot.value = elapsed
  })
}
