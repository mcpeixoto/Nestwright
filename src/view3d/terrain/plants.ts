import * as THREE from 'three'
import { sampleHeight } from '../../model/terrain'
import type { Terrain } from '../../model/types'

interface Scratch {
  pos: number[]
  nrm: number[]
  col: number[]
  sway: number[]
}

function tone(hex: number, salt: number): [number, number, number] {
  const shift = ((Math.abs(salt) % 5) - 2) * 0.04
  const channel = (value: number, scale: number) => Math.min(1, Math.max(0, value / 255 + shift * scale))
  return [channel((hex >> 16) & 255, 1), channel((hex >> 8) & 255, 0.7), channel(hex & 255, 0.4)]
}

function tri(s: Scratch, a: number[], b: number[], c: number[], color: [number, number, number], sway: number) {
  const ux = (b[0] ?? 0) - (a[0] ?? 0)
  const uy = (b[1] ?? 0) - (a[1] ?? 0)
  const uz = (b[2] ?? 0) - (a[2] ?? 0)
  const vx = (c[0] ?? 0) - (a[0] ?? 0)
  const vy = (c[1] ?? 0) - (a[1] ?? 0)
  const vz = (c[2] ?? 0) - (a[2] ?? 0)
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz) || 1
  nx /= length
  ny /= length
  nz /= length
  for (const p of [a, b, c]) {
    s.pos.push(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0)
    s.nrm.push(nx, ny, nz)
    s.col.push(color[0], color[1], color[2])
    s.sway.push(sway)
  }
}

function addCone(s: Scratch, y0: number, y1: number, r0: number, r1: number, sides: number, hex: number, sway: number) {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2
    const a1 = ((i + 1) / sides) * Math.PI * 2
    const p0 = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0]
    const p1 = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0]
    const q0 = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1]
    const q1 = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1]
    const color = tone(hex, i + Math.round(y1 * 10))
    tri(s, p0, p1, q1, color, sway)
    tri(s, p0, q1, q0, color, sway)
  }
}

function addBall(s: Scratch, cx: number, cy: number, cz: number, radius: number, hex: number, sway: number, lat = 4, lon = 6) {
  const at = (i: number, j: number) => {
    const v = (i / lat) * Math.PI
    const u = (j / lon) * Math.PI * 2
    return [cx + Math.sin(v) * Math.cos(u) * radius, cy + Math.cos(v) * radius, cz + Math.sin(v) * Math.sin(u) * radius]
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const color = tone(hex, i * 13 + j)
      tri(s, at(i, j), at(i + 1, j), at(i + 1, j + 1), color, sway)
      tri(s, at(i, j), at(i + 1, j + 1), at(i, j + 1), color, sway)
    }
  }
}

function addBox(s: Scratch, cx: number, cy: number, cz: number, w: number, h: number, d: number, hex: number, sway: number) {
  const x = w / 2
  const y = h / 2
  const z = d / 2
  const c = [
    [cx - x, cy - y, cz - z],
    [cx + x, cy - y, cz - z],
    [cx + x, cy + y, cz - z],
    [cx - x, cy + y, cz - z],
    [cx - x, cy - y, cz + z],
    [cx + x, cy - y, cz + z],
    [cx + x, cy + y, cz + z],
    [cx - x, cy + y, cz + z],
  ]
  const faces: readonly (readonly number[])[] = [
    [3, 2, 6, 7],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [4, 0, 3, 7],
    [4, 7, 6, 5],
    [0, 1, 2, 3],
  ]
  faces.forEach((face, index) => {
    const color = tone(hex, index + 3)
    const a = c[face[0] ?? 0] ?? c[0]!
    const b = c[face[1] ?? 0] ?? c[0]!
    const d0 = c[face[2] ?? 0] ?? c[0]!
    const e = c[face[3] ?? 0] ?? c[0]!
    tri(s, a, b, d0, color, sway)
    tri(s, a, d0, e, color, sway)
  })
}

function scratch(): Scratch {
  return { pos: [], nrm: [], col: [], sway: [] }
}

function geometry(s: Scratch): THREE.BufferGeometry {
  if (s.pos.length < 9) addBox(s, 0, 0.2, 0, 0.2, 0.4, 0.2, 0x668844, 0)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3))
  geo.setAttribute('sway', new THREE.Float32BufferAttribute(s.sway, 1))
  geo.computeBoundingSphere()
  return geo
}

function tree(trunk: number, leaf: number, leaf2: number, kind: string): Scratch {
  const s = scratch()
  if (kind === 'pine' || kind === 'cypress') {
    addCone(s, 0, kind === 'cypress' ? 1.4 : 1.1, 0.16, 0.1, 6, trunk, 0)
    const tiers = kind === 'cypress' ? 5 : 3
    for (let i = 0; i < tiers; i++) {
      const y = 1 + i * (kind === 'cypress' ? 1.05 : 1.15)
      addCone(s, y, y + (kind === 'cypress' ? 1.35 : 1.7), kind === 'cypress' ? 0.42 - i * 0.05 : 1.15 - i * 0.28, 0.02, 7, i % 2 ? leaf2 : leaf, 1)
    }
    return s
  }
  if (kind === 'palm') {
    addCone(s, 0, 4.2, 0.16, 0.1, 6, trunk, 0)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const x = Math.cos(a)
      const z = Math.sin(a)
      tri(s, [0, 4.15, 0], [x * 1.45, 3.55, z * 1.45], [Math.cos(a + 0.35) * 1.15, 3.75, Math.sin(a + 0.35) * 1.15], tone(leaf, i), 1)
    }
    return s
  }
  const height = kind === 'birch' ? 2.3 : kind === 'olive' ? 1.15 : kind === 'fruit-tree' ? 1.25 : 1.7
  const radius = kind === 'birch' ? 0.11 : 0.18
  addCone(s, 0, height, radius, radius * 0.72, 6, trunk, 0)
  addBall(s, 0, height + 0.85, 0, kind === 'olive' ? 0.95 : 1.15, leaf, 1)
  addBall(s, 0.45, height + 0.45, 0.2, 0.72, leaf2, 1)
  addBall(s, -0.4, height + 0.55, -0.15, 0.66, leaf, 1)
  if (kind === 'fruit-tree') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      addBall(s, Math.cos(a) * 0.45, height + 0.7, Math.sin(a) * 0.4, 0.08, 0xc4483a, 0, 2, 3)
    }
  }
  return s
}

function buildSpecies(species: string): THREE.BufferGeometry {
  const s = scratch()
  if (species === 'oak') return geometry(tree(0x6b4a30, 0x3f6b34, 0x6a8f3e, 'oak'))
  if (species === 'birch') return geometry(tree(0xe4dcc8, 0x7ea35a, 0xc5d48a, 'birch'))
  if (species === 'pine') return geometry(tree(0x5a4030, 0x1f4a32, 0x2f6a42, 'pine'))
  if (species === 'cypress') return geometry(tree(0x6a5340, 0x24543a, 0x1c4030, 'cypress'))
  if (species === 'palm') return geometry(tree(0x8a6a42, 0x2f7a40, 0x3e8a48, 'palm'))
  if (species === 'olive') return geometry(tree(0x7a6a52, 0x8a9360, 0xa8b07a, 'olive'))
  if (species === 'fruit-tree') return geometry(tree(0x6d4c32, 0x4e7a3c, 0x6e9448, 'fruit-tree'))
  if (species === 'bush-round') {
    addBall(s, 0, 0.45, 0, 0.48, 0x3f6b34, 1)
    return geometry(s)
  }
  if (species === 'bush-flowering') {
    addBall(s, 0, 0.42, 0, 0.46, 0x3f6b34, 1)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      addBall(s, Math.cos(a) * 0.28, 0.62, Math.sin(a) * 0.28, 0.1, i % 2 ? 0xd46a8a : 0xf2d2dc, 0.4, 2, 3)
    }
    return geometry(s)
  }
  if (species === 'hedge-segment') {
    addBox(s, 0, 0.55, 0, 1.15, 1.05, 0.55, 0x2f6b3c, 0.35)
    return geometry(s)
  }
  if (species === 'flowers-mixed' || species === 'lavender') {
    const flower = species === 'lavender' ? 0x7a68b0 : 0xe0b43a
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.08
      addCone(s, 0, 0.28, 0.015, 0.01, 3, 0x3e6a32, 1)
      addBall(s, x, 0.34, (i % 2) * 0.05, 0.06, flower, 1, 2, 4)
    }
    return geometry(s)
  }
  if (species === 'sunflowers') {
    addCone(s, 0, 1.35, 0.03, 0.02, 4, 0x3e6a32, 1)
    addBall(s, 0, 1.48, 0, 0.16, 0xe2b434, 1, 3, 5)
    addBall(s, 0, 1.48, 0, 0.06, 0x5a3a22, 0, 2, 4)
    return geometry(s)
  }
  if (species === 'tall-grass' || species === 'reeds') {
    const h = species === 'reeds' ? 1.25 : 0.62
    const hex = species === 'reeds' ? 0x8a9a58 : 0x6a8f3e
    for (let i = 0; i < 4; i++) {
      const lean = (i - 1.5) * 0.08
      addCone(s, 0, h, 0.02, 0.008, 3, hex, 1)
      s.pos[s.pos.length - 6] = (s.pos[s.pos.length - 6] ?? 0) + lean
    }
    return geometry(s)
  }
  if (species === 'rock-large' || species === 'rock-small') {
    const r = species === 'rock-large' ? 0.55 : 0.22
    addBall(s, 0, r * 0.7, 0, r, 0x8a8680, 0, 3, 5)
    addBall(s, r * 0.35, r * 0.45, r * 0.1, r * 0.55, 0x6e6a64, 0, 3, 4)
    return geometry(s)
  }
  addBall(s, 0, 0.4, 0, 0.4, 0x3f6b34, 1)
  return geometry(s)
}

const CHUNK = 16

function chunkKey(species: string, x: number, y: number): string {
  return `${species}:${Math.floor(x / CHUNK)}:${Math.floor(y / CHUNK)}`
}

interface Batch {
  mesh: THREE.InstancedMesh
  capacity: number
}

export class PlantField {
  readonly group = new THREE.Group()
  private batches = new Map<string, Batch>()
  private geos = new Map<string, THREE.BufferGeometry>()
  private material: THREE.MeshStandardMaterial
  private time = { value: 0 }
  private dummy = new THREE.Object3D()

  constructor() {
    this.group.name = 'plants'
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide })
    this.material.customProgramCacheKey = () => 'nestwright-plant-wind'
    const time = this.time
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float gust = sin(uTime * 1.45 + position.y * 0.35 + instanceMatrix[3].x * 0.37);
           transformed.x += sway * gust * position.y * 0.03;
           transformed.z += sway * cos(uTime * 1.15 + position.y * 0.5) * position.y * 0.02;`,
        )
    }
  }

  private geometry(species: string): THREE.BufferGeometry {
    const cached = this.geos.get(species)
    if (cached) return cached
    const geo = buildSpecies(species)
    this.geos.set(species, geo)
    return geo
  }

  sync(terrain: Terrain): void {
    const groups = new Map<string, Terrain['plants']>()
    for (const plant of terrain.plants) {
      if (!plant || !Number.isFinite(plant.position?.x) || !Number.isFinite(plant.position?.y)) continue
      const key = chunkKey(plant.species || 'bush-round', plant.position.x, plant.position.y)
      const list = groups.get(key)
      if (list) list.push(plant)
      else groups.set(key, [plant])
    }
    const seen = new Set<string>()
    for (const [key, list] of groups) {
      seen.add(key)
      const species = list[0]?.species || 'bush-round'
      let batch = this.batches.get(key)
      if (!batch || batch.capacity < list.length) {
        if (batch) {
          this.group.remove(batch.mesh)
          batch.mesh.dispose()
        }
        const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(list.length)))
        const mesh = new THREE.InstancedMesh(this.geometry(species), this.material, capacity)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.castShadow = false
        mesh.receiveShadow = true
        mesh.frustumCulled = true
        mesh.userData.kind = 'plant'
        mesh.count = 0
        this.group.add(mesh)
        batch = { mesh, capacity }
        this.batches.set(key, batch)
      }
      const mesh = batch.mesh
      mesh.count = list.length
      const ids: string[] = []
      for (let i = 0; i < list.length; i++) {
        const plant = list[i]
        if (!plant) continue
        const scale = Number.isFinite(plant.scale) && plant.scale > 0 ? plant.scale : 1
        const y = sampleHeight(terrain, plant.position.x, plant.position.y)
        this.dummy.position.set(plant.position.x, Number.isFinite(y) ? y : 0, plant.position.y)
        this.dummy.rotation.set(0, Number.isFinite(plant.rotation) ? -plant.rotation : 0, 0)
        this.dummy.scale.setScalar(scale)
        this.dummy.updateMatrix()
        mesh.setMatrixAt(i, this.dummy.matrix)
        ids.push(plant.id)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.userData.instanceIds = ids
      mesh.boundingSphere = null
      mesh.computeBoundingSphere()
    }
    for (const [key, batch] of this.batches) {
      if (seen.has(key)) continue
      this.group.remove(batch.mesh)
      batch.mesh.dispose()
      this.batches.delete(key)
    }
  }

  update(elapsed: number): void {
    this.time.value = elapsed
  }

  dispose(): void {
    for (const batch of this.batches.values()) {
      this.group.remove(batch.mesh)
      batch.mesh.dispose()
    }
    this.batches.clear()
    for (const geo of this.geos.values()) geo.dispose()
    this.geos.clear()
    this.material.dispose()
  }
}
