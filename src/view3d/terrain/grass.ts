import * as THREE from 'three'
import { attribute, cameraPosition, cos, length, mix, positionGeometry, sin, smoothstep, uniform, vec3, vec4 } from 'three/tsl'
import { sampleHeight } from '../../model/terrain'
import type { Project } from '../../model/types'
import { srgbByteToLinear } from '../colorLinear'
import { windTime } from './foliageMaterials'
import { buildGrassMask, grassIndoorAt, type GrassMask } from './grassMask'
import { LAWN_ALBEDO } from './textures'

/** Blade field settings for one graphics tier; null turns grass off. */
export interface GrassTier {
  /** Blades grow out to this distance from the camera, shrinking into the lawn texture. */
  radius: number
  /** World grid step: one clump per cell at most. */
  cell: number
}

const GRASS_A = 'grassA'
const GRASS_B = 'grassB'
const GRASS_T = 'grassT'
const BLADES = 10

function hash2(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(salt, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** One clump: ten tapered blades leaning out of a small circle; unit height, base at y = 0. */
export function clumpGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const tt: number[] = []
  const idx: number[] = []
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + hash2(b, 3, 1) * 0.9
    const r = 0.15 + hash2(b, 5, 2) * 0.85
    const h = 0.6 + hash2(b, 7, 3) * 0.4
    const w = 0.06 + hash2(b, 9, 4) * 0.03
    const lean = 0.12 + hash2(b, 11, 5) * 0.2
    const ox = Math.cos(a) * r
    const oz = Math.sin(a) * r
    // The blade faces a random way; its width runs across that facing.
    const f = a + Math.PI / 2 + (hash2(b, 13, 6) - 0.5) * 1.2
    const sx = Math.cos(f) * w * 0.5
    const sz = Math.sin(f) * w * 0.5
    const lx = Math.cos(a) * lean
    const lz = Math.sin(a) * lean
    const base = pos.length / 3
    const rows: [number, number][] = [
      [0, 1],
      [0.55, 0.72],
    ]
    for (const [t, width] of rows) {
      const bend = t * t
      const cx = ox + lx * bend
      const cz = oz + lz * bend
      pos.push(cx - sx * width, t * h, cz - sz * width, cx + sx * width, t * h, cz + sz * width)
      tt.push(t, t)
    }
    pos.push(ox + lx, h, oz + lz)
    tt.push(1)
    for (let v = 0; v < 5; v++) {
      // Mostly up, so the lawn and its blades light alike; a hint of the blade's facing.
      const n = new THREE.Vector3(Math.cos(f + Math.PI / 2) * 0.35, 1, Math.sin(f + Math.PI / 2) * 0.35).normalize()
      nrm.push(n.x, n.y, n.z)
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute(GRASS_T, new THREE.Float32BufferAttribute(tt, 1))
  geo.setIndex(idx)
  return geo
}

function grassMaterial(radius: THREE.UniformNode<'float', number>): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0, side: THREE.DoubleSide })
  mat.name = 'grass-blades'
  const a = attribute<'vec4'>(GRASS_A, 'vec4')
  const b = attribute<'vec3'>(GRASS_B, 'vec3')
  const t = attribute<'float'>(GRASS_T, 'float')
  const c = cos(b.x)
  const s = sin(b.x)
  const g = positionGeometry
  const rx = g.x.mul(c).add(g.z.mul(s))
  const rz = g.z.mul(c).sub(g.x.mul(s))
  const tall = a.w.mul(mix(1, 1.8, b.y))
  // Shrink into the ground towards the edge of the field, where the lawn texture takes over.
  const fade = smoothstep(radius, radius.mul(0.6), length(cameraPosition.sub(a.xyz)))
  const h = g.y.mul(tall).mul(fade)
  const gust = sin(windTime.mul(1.7).add(a.x.mul(0.35)).add(a.z.mul(0.21))).add(
    sin(windTime.mul(3.1).add(a.x.mul(0.9)).sub(a.z.mul(0.7))).mul(0.45),
  )
  const push = t.mul(t).mul(tall).mul(fade).mul(gust.mul(0.16).add(0.2))
  // Far clumps are fewer and wider (b.z), so the field keeps its coverage on screen.
  const spread = a.w.mul(0.75).mul(b.z)
  mat.positionNode = a.xyz.add(vec3(rx.mul(spread).add(push.mul(0.9)), h.sub(push.mul(push).mul(0.8)), rz.mul(spread).add(push.mul(0.4))))
  const lawn = vec3(srgbByteToLinear(LAWN_ALBEDO.r), srgbByteToLinear(LAWN_ALBEDO.g), srgbByteToLinear(LAWN_ALBEDO.b))
  const dry = vec3(srgbByteToLinear(150), srgbByteToLinear(150), srgbByteToLinear(70))
  const vary = sin(a.x.mul(3.7).add(a.z.mul(5.1))).mul(0.5).add(0.5)
  const tip = mix(lawn.mul(1.3), dry, b.y.mul(0.5).add(vary.mul(0.05)))
  const rgb = mix(lawn.mul(0.5), tip, t).mul(mix(0.88, 1.08, vary))
  mat.colorNode = vec4(rgb, 1)
  return mat
}

/**
 * Instanced blade clumps around the camera on lawn and meadow. Positions sit on a fixed
 * world grid with hashed jitter, so moving the camera adds and drops clumps at the edge but
 * never shuffles the ones in view. The field is rebuilt when the camera has moved a few
 * metres or the project changed; the shader handles the edge fade and wind.
 */
export class GrassField {
  readonly mesh: THREE.InstancedMesh
  private material: THREE.MeshStandardNodeMaterial
  private radius = uniform(30)
  private a: THREE.InstancedBufferAttribute
  private b: THREE.InstancedBufferAttribute
  private capacity = 0
  private mask: GrassMask | null = null
  private project: Project | null = null
  private tier: GrassTier | null = null
  private built = { x: Number.NaN, y: Number.NaN, z: Number.NaN }
  private eye = new THREE.Vector3()
  private stale = true

  constructor() {
    this.material = grassMaterial(this.radius)
    const { mesh, a, b } = this.allocate(4096)
    this.mesh = mesh
    this.a = a
    this.b = b
  }

  private allocate(capacity: number): { mesh: THREE.InstancedMesh; a: THREE.InstancedBufferAttribute; b: THREE.InstancedBufferAttribute } {
    const base = clumpGeometry()
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    const b = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    a.setUsage(THREE.DynamicDrawUsage)
    b.setUsage(THREE.DynamicDrawUsage)
    base.setAttribute(GRASS_A, a)
    base.setAttribute(GRASS_B, b)
    const mesh = this.mesh ?? new THREE.InstancedMesh(base, this.material, capacity)
    if (this.mesh) {
      // Same mesh, bigger buffers: identity matrices, the card is placed by the shader.
      this.mesh.geometry.dispose()
      this.mesh.geometry = base
      ;(this.mesh as { instanceMatrix: THREE.InstancedBufferAttribute }).instanceMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 16),
        16,
      )
    }
    const identity = new THREE.Matrix4()
    for (let i = 0; i < capacity; i++) identity.toArray(mesh.instanceMatrix.array, i * 16)
    mesh.instanceMatrix.needsUpdate = true
    mesh.name = 'grass'
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.count = 0
    mesh.visible = false
    mesh.raycast = () => {}
    this.capacity = capacity
    return { mesh, a, b }
  }

  /** New project or ground mode: re-rasterise where grass may grow. */
  sync(project: Project, mode: 'meadow' | 'asphalt', tier: GrassTier | null): void {
    const tierChanged = (tier?.radius ?? 0) !== (this.tier?.radius ?? 0) || (tier?.cell ?? 0) !== (this.tier?.cell ?? 0)
    if (project === this.project && !tierChanged) return
    this.project = project
    this.tier = tier
    this.mask = tier ? buildGrassMask(project, mode) : null
    this.stale = true
  }

  update(camera: THREE.Camera): void {
    const tier = this.tier
    if (!tier || !this.mask || !this.project) {
      this.mesh.visible = false
      return
    }
    camera.getWorldPosition(this.eye)
    const moved = Math.hypot(this.eye.x - this.built.x, this.eye.z - this.built.z)
    if (!this.stale && moved < tier.cell * 8 && Math.abs(this.eye.y - this.built.y) < 2) return
    this.stale = false
    this.built = { x: this.eye.x, y: this.eye.y, z: this.eye.z }
    this.rebuild(tier, this.mask)
  }

  private rebuild(tier: GrassTier, mask: GrassMask): void {
    const terrain = this.project?.terrain
    const useHeights = !!terrain && terrain.enabled !== false && terrain.resolution >= 1
    const R = tier.radius
    const eye = this.eye
    const flatR2 = R * R - Math.min(R * R, eye.y * eye.y)
    const reach = Math.sqrt(Math.max(0, flatR2))
    const c0x = Math.floor((eye.x - reach) / tier.cell)
    const c1x = Math.floor((eye.x + reach) / tier.cell)
    const c0z = Math.floor((eye.z - reach) / tier.cell)
    const c1z = Math.floor((eye.z + reach) / tier.cell)
    let n = 0
    // Inside the house only what the windows frame needs grass; the field is halved.
    const inside = grassIndoorAt(mask, eye.x, eye.z) && eye.y < 8
    const near = R * (inside ? 0.14 : 0.28)
    const far = inside ? R * 0.5 : R
    this.radius.value = far
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const x = (cx + hash2(cx, cz, 11)) * tier.cell
        const z = (cz + hash2(cx, cz, 17)) * tier.cell
        const ix = Math.floor((x - mask.minX) / mask.cell)
        const iz = Math.floor((z - mask.minZ) / mask.cell)
        if (ix < 0 || iz < 0 || ix >= mask.cols || iz >= mask.rows) continue
        const cover = (mask.cover[iz * mask.cols + ix] ?? 0) / 255
        if (cover <= 0) continue
        const ground = useHeights && terrain ? sampleHeight(terrain, x, z) : (mask.height[iz * mask.cols + ix] ?? 0)
        const d = Math.hypot(x - eye.x, ground - eye.y, z - eye.z)
        if (d > far) continue
        // Full density close in, then falling a little slower than distance squared (which
        // would keep blades per screen area even); the survivors grow wider to keep the cover.
        const density = d < near ? 1 : (near / d) ** 1.4
        if (hash2(cx, cz, 23) > cover * density) continue
        if (n >= this.capacity) this.grow(n * 2)
        const scale = 0.17 + hash2(cx, cz, 29) * 0.1
        this.a.setXYZW(n, x, ground - 0.01, z, scale)
        this.b.setXYZ(n, hash2(cx, cz, 31) * Math.PI * 2, (mask.meadow[iz * mask.cols + ix] ?? 0) / 255, Math.min(3, 1 / Math.sqrt(density)))
        n++
      }
    }
    this.mesh.count = n
    this.mesh.visible = n > 0
    this.a.needsUpdate = true
    this.b.needsUpdate = true
  }

  private grow(capacity: number): void {
    const oldA = this.a
    const oldB = this.b
    const { a, b } = this.allocate(capacity)
    ;(a.array as Float32Array).set(oldA.array as Float32Array)
    ;(b.array as Float32Array).set(oldB.array as Float32Array)
    this.a = a
    this.b = b
  }

  /** Clumps and triangles drawn now, for perf reports. */
  stats(): { clumps: number; triangles: number } {
    const index = this.mesh.geometry.getIndex()
    const per = (index ? index.count : 0) / 3
    return { clumps: this.mesh.visible ? this.mesh.count : 0, triangles: this.mesh.visible ? this.mesh.count * per : 0 }
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.mesh.dispose()
  }
}
