import * as THREE from 'three'
import { getMaterial } from '../../materials/materialCache'
import { srgbByteToLinear } from '../colorLinear'
import { dist, normalize, perp, polygonArea, sub } from '../../model/geometry'
import { ivyLeaves, sampleHeight, waterDepth } from '../../model/terrain'
import type { Project, Terrain, Vec2 } from '../../model/types'
import type { LevelDisplay } from '../../store'

const _yaw = (ax: number, az: number, bx: number, bz: number) => Math.atan2(-(bz - az), bx - ax)

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    child.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mats = mesh.material
      const list = Array.isArray(mats) ? mats : mats ? [mats] : []
      for (const mat of list) {
        if (mat?.userData?.own) mat.dispose()
      }
    })
  }
}

/** Clear turquoise. Normals stay geometric: a tilted normal reads as a white shaft on the lawn. */
const POOL_WATER = '#2f8f9a'
const POOL_FLOOR = '#1a5c66'
const COPING_STONE = '#e4ddd2'

function bindRipple(
  mat: THREE.Material,
  time: { value: number },
  cacheKey: string,
  slot: 'normal' | 'color',
  fragmentExtra: string,
): void {
  const token = slot === 'normal' ? '#include <normal_fragment_maps>' : '#include <color_fragment>'
  mat.customProgramCacheKey = () => cacheKey
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nuniform float uTime;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = worldPosition.xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nuniform float uTime;')
      .replace(token, `${token}\n${fragmentExtra}`)
  }
}

function waterMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: POOL_WATER,
    roughness: 0.64,
    metalness: 0,
    transparent: true,
    opacity: 0.8,
    depthWrite: true,
    envMapIntensity: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  })
  bindRipple(
    mat,
    time,
    'nestwright-water',
    'color',
    `diffuseColor.rgb *= 0.95 + 0.05 * sin(vW.x * 7.4 + uTime * 1.2) * sin(vW.z * 6.1 - uTime);`,
  )
  return mat
}

function copingMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: COPING_STONE,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0,
  })
  mat.userData.own = true
  return mat
}

/** Move each vertex of a convex ring inward so the water sits inside the coping. */
function insetConvex(polygon: readonly Vec2[], amount: number): Vec2[] {
  const n = polygon.length
  if (n < 3 || !(amount > 0)) return polygon.map((point) => ({ x: point.x, y: point.y }))
  const ccw = polygonArea(polygon) >= 0
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i + n - 1) % n]!
    const curr = polygon[i]!
    const next = polygon[(i + 1) % n]!
    const e0 = normalize(sub(curr, prev))
    const e1 = normalize(sub(next, curr))
    let n0 = perp(e0)
    let n1 = perp(e1)
    if (!ccw) {
      n0 = { x: -n0.x, y: -n0.y }
      n1 = { x: -n1.x, y: -n1.y }
    }
    let bx = n0.x + n1.x
    let by = n0.y + n1.y
    const len = Math.hypot(bx, by) || 1
    bx /= len
    by /= len
    const denom = bx * n0.x + by * n0.y
    const push = Math.abs(denom) > 0.25 ? amount / denom : amount
    out.push({ x: curr.x + bx * push, y: curr.y + by * push })
  }
  return out
}

function floorMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: POOL_FLOOR,
    roughness: 0.74,
    metalness: 0,
    envMapIntensity: 0.12,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  })
  bindRipple(
    mat,
    time,
    'nestwright-pool-floor',
    'color',
    `float caustic = 0.84 + 0.16 * sin(vW.x * 6.0 + uTime * 1.4) * sin(vW.z * 5.2 - uTime);
     diffuseColor.rgb *= caustic;`,
  )
  return mat
}

function surfaceMesh(polygon: Vec2[], y: number, material: THREE.Material): THREE.Mesh | null {
  if (polygon.length < 3) return null
  const first = polygon[0]
  if (!first) return null
  try {
    const shape = new THREE.Shape()
    shape.moveTo(first.x, -first.y)
    for (let i = 1; i < polygon.length; i++) {
      const p = polygon[i]
      if (p) shape.lineTo(p.x, -p.y)
    }
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, y, 0)
    const mesh = new THREE.Mesh(geo, material)
    mesh.renderOrder = 2
    mesh.receiveShadow = true
    return mesh
  } catch {
    return null
  }
}

function ribbonMesh(points: Vec2[], y: number, half: number, material: THREE.Material): THREE.Mesh | null {
  if (points.length < 2) return null
  const positions: number[] = []
  const left: Vec2[] = []
  const right: Vec2[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const curr = points[i]
    if (!prev || !next || !curr) continue
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    left.push({ x: curr.x + nx * half, y: curr.y + ny * half })
    right.push({ x: curr.x - nx * half, y: curr.y - ny * half })
  }
  for (let i = 0; i < left.length; i++) {
    const l = left[i]
    const r = right[i]
    if (!l || !r) continue
    positions.push(l.x, y, l.y, r.x, y, r.y)
  }
  const index: number[] = []
  for (let i = 0; i < left.length - 1; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  if (index.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.renderOrder = 2
  mesh.receiveShadow = true
  return mesh
}

function segmentBox(a: Vec2, b: Vec2, y: number, height: number, thickness: number, material: THREE.Material): THREE.Mesh | null {
  const length = dist(a, b)
  if (length < 0.05 || height <= 0) return null
  const geo = new THREE.BoxGeometry(length, height, Math.max(0.04, thickness))
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.set((a.x + b.x) / 2, y + height / 2, (a.y + b.y) / 2)
  mesh.rotation.y = _yaw(a.x, a.y, b.x, b.y)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildWater(terrain: Terrain, material: THREE.Material, floorMat: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  let coping: THREE.Material | null = null
  const plaster = getMaterial({ id: 'plaster-warm' })
  for (const body of terrain.water) {
    if (!body || body.polygon.length < 2) continue
    const depth = waterDepth(body)
    const level = Number.isFinite(body.level) ? body.level : 0
    const holder = new THREE.Group()
    holder.userData.entityId = body.id
    holder.userData.kind = 'water'
    if (body.kind === 'stream') {
      const mesh = ribbonMesh(body.polygon, level + 0.02, 0.7, material)
      if (mesh) {
        mesh.castShadow = false
        holder.add(mesh)
      }
    } else {
      const skin = body.kind === 'pool' ? insetConvex(body.polygon, 0.06) : body.polygon
      const mesh = surfaceMesh(skin, level + 0.03, material)
      if (mesh) {
        mesh.castShadow = false
        holder.add(mesh)
      }
    }
    if (body.kind === 'pool') {
      const floor = level - depth
      const bed = surfaceMesh(insetConvex(body.polygon, 0.08), floor + 0.04, floorMat)
      if (bed) {
        bed.renderOrder = 1
        bed.castShadow = false
        holder.add(bed)
      }
      for (let i = 0; i < body.polygon.length; i++) {
        const a = body.polygon[i]
        const b = body.polygon[(i + 1) % body.polygon.length]
        if (!a || !b) continue
        if (!coping) coping = copingMaterial()
        const wall = segmentBox(a, b, floor, Math.max(0.2, depth), 0.1, plaster)
        const lip = segmentBox(a, b, level, 0.12, 0.34, coping)
        if (wall) {
          wall.castShadow = false
          holder.add(wall)
        }
        if (lip) {
          lip.castShadow = false
          holder.add(lip)
        }
      }
    }
    holder.traverse((obj) => {
      if (obj === holder) return
      obj.userData.entityId = body.id
      obj.userData.kind = 'water'
    })
    group.add(holder)
  }
  return group
}

interface BoxBuf {
  pos: number[]
  col: number[]
}

function pushBox(buf: BoxBuf, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, color: number) {
  const hx = sx / 2
  const hy = sy / 2
  const hz = sz / 2
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const rot = (x: number, y: number, z: number): [number, number, number] => [cx + x * c + z * s, cy + y, cz - x * s + z * c]
  const p = [
    rot(-hx, -hy, -hz),
    rot(hx, -hy, -hz),
    rot(hx, hy, -hz),
    rot(-hx, hy, -hz),
    rot(-hx, -hy, hz),
    rot(hx, -hy, hz),
    rot(hx, hy, hz),
    rot(-hx, hy, hz),
  ]
  const r = srgbByteToLinear((color >> 16) & 255)
  const g = srgbByteToLinear((color >> 8) & 255)
  const b = srgbByteToLinear(color & 255)
  const faces = [
    [3, 2, 6, 7],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [4, 0, 3, 7],
    [4, 7, 6, 5],
    [0, 1, 2, 3],
  ]
  for (const face of faces) {
    const a = p[face[0] ?? 0]
    const d = p[face[1] ?? 0]
    const e = p[face[2] ?? 0]
    const f = p[face[3] ?? 0]
    if (!a || !d || !e || !f) continue
    for (const v of [a, d, e, a, e, f]) {
      buf.pos.push(v[0], v[1], v[2])
      buf.col.push(r, g, b)
    }
  }
}

function coloredMesh(buf: BoxBuf, transparent = false): THREE.Mesh | null {
  if (buf.pos.length < 9) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: transparent ? 0.05 : 0.78,
    metalness: transparent ? 0.04 : 0.02,
    transparent,
    opacity: transparent ? 0.38 : 1,
    depthWrite: !transparent,
  })
  mat.userData.own = true
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = !transparent
  mesh.receiveShadow = true
  return mesh
}

function buildFence(fence: Terrain['fences'][number]): THREE.Group {
  const group = new THREE.Group()
  group.userData.entityId = fence.id
  group.userData.kind = 'fence'
  const points = fence.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (points.length < 2) return group
  const height = Number.isFinite(fence.height) ? fence.height : 1
  const gates = new Set(fence.gates ?? [])
  const style = fence.style
  const wood = style === 'slatted-wood' ? 0x8d6848 : 0xc4a574
  const post = style === 'metal-rails' || style === 'glass' ? 0x2a2e32 : style === 'stone-wall' ? 0x8a867e : 0x6b4a30
  const accent = style === 'hedge' ? 0x2f6b3c : style === 'stone-wall' ? 0x9a948c : style === 'metal-rails' ? 0x3a4046 : wood
  const solid: BoxBuf = { pos: [], col: [] }
  const glass: BoxBuf = { pos: [], col: [] }
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!p) continue
    const postH = style === 'hedge' ? height : height + 0.08
    const postW = style === 'stone-wall' ? 0.08 : 0.08
    if (style !== 'hedge' && style !== 'stone-wall') pushBox(solid, p.x, postH / 2, p.y, postW, postH, postW, 0, post)
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    const length = dist(a, b)
    if (length < 0.08) continue
    const yaw = _yaw(a.x, a.y, b.x, b.y)
    const mx = (a.x + b.x) / 2
    const mz = (a.y + b.y) / 2
    const gate = gates.has(i)
    if (style === 'stone-wall') {
      pushBox(solid, mx, height / 2, mz, length, height, 0.38, yaw, accent)
      continue
    }
    if (style === 'hedge') {
      pushBox(solid, mx, height / 2, mz, length, height, 0.55, yaw, accent)
      continue
    }
    if (gate) {
      const leafW = Math.max(0.4, length * 0.82)
      const target = style === 'glass' ? glass : solid
      pushBox(target, mx, height * 0.48, mz, leafW, height * 0.9, style === 'glass' ? 0.04 : 0.06, yaw, style === 'glass' ? 0xd5e4ea : wood)
      continue
    }
    if (style === 'glass') {
      pushBox(glass, mx, height * 0.48, mz, Math.max(0.2, length - 0.1), height * 0.82, 0.03, yaw, 0xd5e4ea)
      continue
    }
    if (style === 'metal-rails') {
      pushBox(solid, mx, height * 0.72, mz, length, 0.04, 0.04, yaw, accent)
      pushBox(solid, mx, height * 0.38, mz, length, 0.04, 0.04, yaw, accent)
      continue
    }
    if (style === 'slatted-wood') {
      for (let s = 0; s < 3; s++) pushBox(solid, mx, height * (0.28 + s * 0.24), mz, length, 0.08, 0.03, yaw, accent)
      continue
    }
    const pickets = Math.max(2, Math.floor(length / 0.14))
    for (let p = 0; p < pickets; p++) {
      const t = (p + 0.5) / pickets
      pushBox(solid, a.x + (b.x - a.x) * t, height * 0.46, a.y + (b.y - a.y) * t, 0.05, height * 0.86, 0.02, yaw, accent)
    }
    pushBox(solid, mx, height * 0.72, mz, length, 0.05, 0.04, yaw, post)
  }
  const mesh = coloredMesh(solid)
  const pane = coloredMesh(glass, true)
  if (mesh) {
    mesh.userData.entityId = fence.id
    mesh.userData.kind = 'fence'
    group.add(mesh)
  }
  if (pane) {
    pane.userData.entityId = fence.id
    pane.userData.kind = 'fence'
    group.add(pane)
  }
  return group
}

function buildBoundary(terrain: Terrain): THREE.Group {
  const group = new THREE.Group()
  const wood = getMaterial({ id: 'walnut-planks' })
  const points = terrain.boundary.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  for (const point of points) {
    const y = sampleHeight(terrain, point.x, point.y)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), wood)
    post.position.set(point.x, (Number.isFinite(y) ? y : 0) + 0.35, point.y)
    post.castShadow = true
    post.receiveShadow = true
    group.add(post)
  }
  if (points.length >= 2) {
    const positions: number[] = []
    const ring = [...points, points[0]].filter((p): p is Vec2 => !!p)
    for (const point of ring) {
      const y = sampleHeight(terrain, point.x, point.y)
      positions.push(point.x, (Number.isFinite(y) ? y : 0) + 0.08, point.y)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.LineDashedMaterial({ color: 0x3fb8af, dashSize: 0.45, gapSize: 0.28 })
    mat.userData.own = true
    const line = new THREE.Line(geo, mat)
    line.computeLineDistances()
    line.raycast = () => {}
    group.add(line)
  }
  return group
}

function leafGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0.02, 0, 0.075, 0.08, 0, 0, 0.17, 0, -0.075, 0.08, 0], 3),
  )
  const leaf = [0.25, 0.45, 0.22, 0.4, 0.62, 0.28, 0.18, 0.38, 0.16, 0.32, 0.55, 0.24].map((channel) =>
    srgbByteToLinear(Math.round(channel * 255)),
  )
  geo.setAttribute('color', new THREE.Float32BufferAttribute(leaf, 3))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  geo.computeVertexNormals()
  return geo
}

function buildIvy(project: Project, display: LevelDisplay, activeId: string): THREE.Group {
  const group = new THREE.Group()
  const active = project.levels.find((level) => level.id === activeId)
  const elev = active?.elevation ?? 0
  const leaves: { wallLevel: number; leaf: ReturnType<typeof ivyLeaves>[number] }[] = []
  for (const level of project.levels) {
    const above = level.elevation > elev + 1e-3
    if (display !== 'all' && above) continue
    if (display === 'current' && level.id !== activeId) continue
    for (const wall of level.walls) {
      if (!wall.ivy) continue
      for (const side of ['left', 'right'] as const) {
        if ((wall.ivy[side] ?? 0) <= 0.001) continue
        for (const leaf of ivyLeaves(wall, side)) leaves.push({ wallLevel: level.elevation, leaf })
      }
    }
  }
  if (leaves.length === 0) return group
  const geo = leafGeometry()
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.35,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  })
  mat.userData.own = true
  const mesh = new THREE.InstancedMesh(geo, mat, leaves.length)
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.userData.kind = 'ivy'
  const dummy = new THREE.Object3D()
  leaves.forEach((entry, index) => {
    const leaf = entry.leaf
    dummy.position.set(leaf.position.x, entry.wallLevel + leaf.elevation, leaf.position.y)
    dummy.rotation.set(0, leaf.rotation, 0)
    dummy.scale.setScalar(leaf.scale)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  group.add(mesh)
  return group
}

export class OutsideFeatures {
  readonly group = new THREE.Group()
  private waterMat: THREE.MeshStandardMaterial
  private floorMat: THREE.MeshStandardMaterial
  private time = { value: 0 }
  private waterRef: Terrain['water'] | null = null
  private fenceRef: Terrain['fences'] | null = null
  private boundaryRef: Terrain['boundary'] | null = null
  private heightsRef: Terrain['heights'] | null = null
  private ivySig = ''

  constructor() {
    this.group.name = 'outside-features'
    this.waterMat = waterMaterial(this.time)
    this.floorMat = floorMaterial(this.time)
  }

  sync(project: Project, display: LevelDisplay, activeId: string): void {
    const terrain = project.terrain
    if (!terrain) return
    if (terrain.water !== this.waterRef) {
      this.waterRef = terrain.water
      const previous = this.group.getObjectByName('water')
      if (previous) {
        this.group.remove(previous)
        clearGroup(previous as THREE.Group)
      }
      const water = buildWater(terrain, this.waterMat, this.floorMat)
      water.name = 'water'
      this.group.add(water)
    }
    if (terrain.fences !== this.fenceRef) {
      this.fenceRef = terrain.fences
      const previous = this.group.getObjectByName('fences')
      if (previous) {
        this.group.remove(previous)
        clearGroup(previous as THREE.Group)
      }
      const fences = new THREE.Group()
      fences.name = 'fences'
      for (const fence of terrain.fences) fences.add(buildFence(fence))
      this.group.add(fences)
    }
    if (terrain.boundary !== this.boundaryRef || terrain.heights !== this.heightsRef) {
      this.boundaryRef = terrain.boundary
      this.heightsRef = terrain.heights
      const previous = this.group.getObjectByName('boundary')
      if (previous) {
        this.group.remove(previous)
        clearGroup(previous as THREE.Group)
      }
      const boundary = buildBoundary(terrain)
      boundary.name = 'boundary'
      this.group.add(boundary)
    }
    const sig = ivySignature(project, display, activeId)
    if (sig !== this.ivySig) {
      this.ivySig = sig
      const previous = this.group.getObjectByName('ivy')
      if (previous) {
        this.group.remove(previous)
        clearGroup(previous as THREE.Group)
      }
      const ivy = buildIvy(project, display, activeId)
      ivy.name = 'ivy'
      this.group.add(ivy)
    }
  }

  update(elapsed: number): void {
    this.time.value = elapsed
  }

  dispose(): void {
    clearGroup(this.group)
    this.waterMat.dispose()
    this.floorMat.dispose()
  }
}

function ivySignature(project: Project, display: LevelDisplay, activeId: string): string {
  const active = project.levels.find((level) => level.id === activeId)
  const elev = active?.elevation ?? 0
  let sig = `${display}:${activeId}`
  for (const level of project.levels) {
    const above = level.elevation > elev + 1e-3
    if (display !== 'all' && above) continue
    if (display === 'current' && level.id !== activeId) continue
    for (const wall of level.walls) {
      if (!wall.ivy) continue
      sig += `|${wall.id}:${wall.ivy.left}:${wall.ivy.right}:${wall.a.x}:${wall.b.y}:${level.elevation}`
    }
  }
  return sig
}
