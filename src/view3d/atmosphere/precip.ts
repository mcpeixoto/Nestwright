import * as THREE from 'three'
import type { Weather } from '../../model/types'
import type { GraphicsQuality } from '../../settings'

const RAIN = 1800
const SNOW = 900

const vertex = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSpeed;
  attribute float aEnd;
  uniform float uTime;
  uniform float uSpan;
  uniform float uDrift;
  uniform float uStreak;
  void main() {
    float cycle = mod(aOffset.y - uTime * aSpeed, uSpan);
    float y = cycle - uSpan * 0.5;
    float drift = sin(uTime * 0.4 + aOffset.x) * uDrift;
    vec3 head = cameraPosition + vec3(aOffset.x + drift, y, aOffset.z);
    vec3 tail = head + vec3(drift * 0.15, uStreak, 0.02);
    vec3 p = mix(head, tail, aEnd);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    gl_FragColor = vec4(uColor, uAlpha);
  }
`

export interface Precip {
  group: THREE.Group
  set(weather: Weather, density: number, quality: GraphicsQuality): void
  dispose(): void
}

function build(count: number, name: string): { lines: THREE.LineSegments; uniforms: Record<string, THREE.IUniform> } {
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
  const uniforms = {
    uTime: { value: 0 },
    uSpan: { value: 22 },
    uDrift: { value: 0 },
    uStreak: { value: 0.7 },
    uColor: { value: new THREE.Color('#d5e4ee') },
    uAlpha: { value: 0.45 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
  })
  const lines = new THREE.LineSegments(geometry, material)
  lines.name = name
  lines.frustumCulled = false
  lines.visible = false
  return { lines, uniforms }
}

function budget(quality: GraphicsQuality, full: number): number {
  if (quality === 'low') return Math.round(full * 0.25)
  if (quality === 'medium') return Math.round(full * 0.55)
  if (quality === 'ultra') return full
  return Math.round(full * 0.8)
}

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
      rain.uniforms.uDrift.value = 0.05
      rain.uniforms.uStreak.value = 0.85
      rain.uniforms.uColor.value.set('#c5d7e4')
      rain.uniforms.uAlpha.value = 0.35 + density * 0.25
      snow.uniforms.uDrift.value = 0.8
      snow.uniforms.uStreak.value = 0.08
      snow.uniforms.uColor.value.set('#f7f8fa')
      snow.uniforms.uAlpha.value = 0.55 + density * 0.3
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
    const lines = obj as THREE.LineSegments
    const material = lines.material as THREE.ShaderMaterial | undefined
    const slot = material?.uniforms?.uTime
    if (slot) slot.value = elapsed
  })
}
