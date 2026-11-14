import * as THREE from 'three'
import { ASPHALT_ROUGHNESS, GROUND_ENV_INTENSITY, SIDEWALK_ALBEDO_SRGB, URBAN_HAZE_SRGB } from '../../model/cityLook'
import { sampleHeight } from '../../model/terrain'
import type { Terrain } from '../../model/types'
import { srgbByteToLinear } from '../colorLinear'
import { groundLayerTextures } from './textures'

/** Meadow / asphalt disc radius. Fog still leaves the ridge line readable. */
const REACH = 420
const GROUND_Y = -0.02

const TREE_COUNT = 40
const HEDGE_COUNT = 16

export type SurroundMode = 'meadow' | 'asphalt'

export interface Surround {
  group: THREE.Group
  sync(terrain: Terrain, mode: SurroundMode): void
  dispose(): void
}

function hash(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

function noRaycast(object: THREE.Object3D): void {
  object.raycast = () => {}
  object.traverse((child) => {
    child.raycast = () => {}
  })
}

function roll(x: number, z: number): number {
  const radius = Math.hypot(x, z)
  const gate = smoothstep(32, 90, radius)
  const wave = Math.sin(x * 0.028) * Math.cos(z * 0.024) + Math.sin((x + z) * 0.015) * 0.55
  return gate * wave * 1.25
}

/** True when a plan point lies outside the plot rectangle. The surround must not cover the inside. */
export function surroundOwns(x: number, z: number, width: number, depth: number): boolean {
  if (!(width > 0) || !(depth > 0)) return true
  return Math.abs(x) > width / 2 + 1e-4 || Math.abs(z) > depth / 2 + 1e-4
}

function outsideDistance(x: number, z: number, width: number, depth: number): number {
  const dx = Math.max(Math.abs(x) - width / 2, 0)
  const dz = Math.max(Math.abs(z) - depth / 2, 0)
  return Math.hypot(dx, dz)
}

function axisCoords(half: number, reach: number): number[] {
  const coords: number[] = [-reach]
  for (let x = -reach + 22; x < -half - 24; x += 22) coords.push(x)
  for (let d = 24; d >= 3; d -= 3) coords.push(-half - d)
  coords.push(-half, half)
  for (let d = 3; d <= 24; d += 3) coords.push(half + d)
  for (let x = half + 24 + 22; x < reach; x += 22) coords.push(x)
  coords.push(reach)
  const unique: number[] = []
  for (const value of coords) {
    const prev = unique[unique.length - 1]
    if (prev == null || value - prev > 0.05) unique.push(value)
  }
  return unique
}

const HAZE: readonly [number, number, number] = [190, 205, 220]
const SIDEWALK = SIDEWALK_ALBEDO_SRGB.map((channel) => srgbByteToLinear(channel)) as [number, number, number]
const URBAN = URBAN_HAZE_SRGB.map((channel) => srgbByteToLinear(channel)) as [number, number, number]

function vertexTint(dist: number, radius: number, mode: SurroundMode, x = 0, z = 0): [number, number, number] {
  if (mode === 'asphalt') {
    const fade = smoothstep(REACH * 0.62, REACH, radius)
    const n = (hash(Math.round(x * 1.7) + Math.round(z * 1.3) * 17) - 0.5) * 0.015
    return [
      SIDEWALK[0] + n + (URBAN[0] - SIDEWALK[0]) * fade,
      SIDEWALK[1] + n * 0.85 + (URBAN[1] - SIDEWALK[1]) * fade,
      SIDEWALK[2] + n * 0.7 + (URBAN[2] - SIDEWALK[2]) * fade,
    ]
  }
  const meadow = smoothstep(10, 70, dist)
  const fade = smoothstep(REACH * 0.55, REACH, radius)
  let r = 1
  let g = 1
  let b = 1 - meadow * 0.08
  r += (srgbByteToLinear(HAZE[0]) - r) * fade
  g += (srgbByteToLinear(HAZE[1]) - g) * fade
  b += (srgbByteToLinear(HAZE[2]) - b) * fade
  return [r, g, b]
}

function buildField(terrain: Terrain, mode: SurroundMode): THREE.BufferGeometry {
  const width = terrain.width > 0 ? terrain.width : 40
  const depth = terrain.depth > 0 ? terrain.depth : 30
  const xs = axisCoords(width / 2, REACH)
  const zs = axisCoords(depth / 2, REACH)
  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const stride = xs.length
  for (let iz = 0; iz < zs.length; iz++) {
    for (let ix = 0; ix < xs.length; ix++) {
      const x = xs[ix] ?? 0
      const z = zs[iz] ?? 0
      const dist = outsideDistance(x, z, width, depth)
      const edgeY = sampleHeight(terrain, x, z)
      const blend = smoothstep(1.5, 26, dist)
      const y = mode === 'meadow' ? edgeY * (1 - blend) + (GROUND_Y + roll(x, z)) * blend : GROUND_Y
      positions.push(x, y, z)
      const tint = vertexTint(dist, Math.hypot(x, z), mode, x, z)
      colors.push(tint[0], tint[1], tint[2])
      uvs.push(x * 0.07, z * 0.07)
    }
  }
  const hole = (x0: number, x1: number, z0: number, z1: number) =>
    x0 <= -width / 2 + 1e-3 && x1 >= width / 2 - 1e-3 && z0 <= -depth / 2 + 1e-3 && z1 >= depth / 2 - 1e-3
  for (let iz = 0; iz < zs.length - 1; iz++) {
    for (let ix = 0; ix < xs.length - 1; ix++) {
      const x0 = xs[ix] ?? 0
      const x1 = xs[ix + 1] ?? 0
      const z0 = zs[iz] ?? 0
      const z1 = zs[iz + 1] ?? 0
      if (hole(x0, x1, z0, z1)) continue
      const a = iz * stride + ix
      index.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

function ridgeNoise(angle: number): number {
  return (
    Math.sin(angle * 2.1) * 0.5 +
    Math.sin(angle * 4.7 + 1.3) * 0.27 +
    Math.sin(angle * 9.2 + 2.2) * 0.14 +
    Math.sin(angle * 15.5 + 0.6) * 0.07
  )
}

/** One continuous ridge between 600 m and 850 m. Crests are 25–90 m; the edges sit on the meadow. */
function ridgeGeometry(): THREE.BufferGeometry {
  const rings = 8
  const segs = 160
  const inner = 600
  const outer = 850
  const positions: number[] = []
  const colors: number[] = []
  const ridge: readonly [number, number, number] = [86, 108, 102]
  for (let iy = 0; iy <= rings; iy++) {
    const v = iy / rings
    const radius = inner + (outer - inner) * v
    const skirt = Math.sin(v * Math.PI)
    for (let ix = 0; ix <= segs; ix++) {
      const angle = (ix / segs) * Math.PI * 2
      const n = ridgeNoise(angle + v * 0.35)
      const height = skirt * (25 + (n * 0.5 + 0.5) * 65)
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
      const fade = Math.min(1, v * 0.72 + (1 - skirt) * 0.45)
      colors.push(
        srgbByteToLinear(ridge[0] + (HAZE[0] - ridge[0]) * fade),
        srgbByteToLinear(ridge[1] + (HAZE[1] - ridge[1]) * fade),
        srgbByteToLinear(ridge[2] + (HAZE[2] - ridge[2]) * fade),
      )
    }
  }
  const index: number[] = []
  const stride = segs + 1
  for (let iy = 0; iy < rings; iy++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iy * stride + ix
      index.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

function solid(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.25,
  })
}

function broadleafGeometry(): THREE.BufferGeometry {
  const blobs = [
    { x: 0, y: 4.6, z: 0, r: 1.2, bias: 1 },
    { x: 0.62, y: 4.15, z: 0.2, r: 0.82, bias: 0.86 },
    { x: -0.5, y: 4.3, z: -0.18, r: 0.74, bias: 0.92 },
  ]
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  blobs.forEach((blob, blobIndex) => {
    const geo = new THREE.SphereGeometry(blob.r, 10, 8)
    const pos = geo.getAttribute('position')
    const nrm = geo.getAttribute('normal')
    const indexed = geo.getIndex()
    const push = (i: number) => {
      positions.push(pos.getX(i) + blob.x, pos.getY(i) + blob.y, pos.getZ(i) + blob.z)
      normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
      const vary = 0.86 + ((i * 5 + blobIndex * 3) % 6) * 0.03
      colors.push(vary * blob.bias, vary, vary * 0.92)
    }
    if (indexed) {
      for (let i = 0; i < indexed.count; i++) push(indexed.getX(i))
    } else {
      for (let i = 0; i < pos.count; i++) push(i)
    }
    geo.dispose()
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geo
}

function makeTrees(): {
  group: THREE.Group
  broad: THREE.InstancedMesh
  conifer: THREE.InstancedMesh
  trunks: THREE.InstancedMesh
} {
  const group = new THREE.Group()
  group.name = 'treeline'
  const foliage = new THREE.ConeGeometry(1.45, 6.2, 10)
  foliage.translate(0, 5.1, 0)
  const trunks = new THREE.CylinderGeometry(0.22, 0.32, 1.8, 6)
  trunks.translate(0, 0.9, 0)
  const leafMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.25,
  })
  const broad = new THREE.InstancedMesh(broadleafGeometry(), leafMat, TREE_COUNT)
  const conifer = new THREE.InstancedMesh(foliage, solid('#ffffff'), TREE_COUNT)
  const wood = new THREE.InstancedMesh(trunks, solid('#ffffff'), TREE_COUNT)
  broad.frustumCulled = false
  conifer.frustumCulled = false
  wood.frustumCulled = false
  const tint = new THREE.Color()
  for (let i = 0; i < TREE_COUNT; i++) {
    tint.setHex(hash(i + 5) > 0.45 ? 0x2f6e42 : 0x6a9444)
    broad.setColorAt(i, tint)
    conifer.setColorAt(i, new THREE.Color(0x2f6e42))
    wood.setColorAt(i, new THREE.Color(0x6b4a30))
  }
  if (broad.instanceColor) broad.instanceColor.needsUpdate = true
  if (conifer.instanceColor) conifer.instanceColor.needsUpdate = true
  if (wood.instanceColor) wood.instanceColor.needsUpdate = true
  noRaycast(broad)
  noRaycast(conifer)
  noRaycast(wood)
  group.add(wood)
  group.add(broad)
  group.add(conifer)
  return { group, broad, conifer, trunks: wood }
}

function hedgeGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const body = new THREE.BoxGeometry(1, 0.78, 0.62)
  body.translate(0, 0.39, 0)
  const cap = new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  cap.scale(1.4, 0.55, 0.9)
  cap.translate(0, 0.78, 0)
  for (const geo of [body, cap]) {
    const pos = geo.getAttribute('position')
    const nrm = geo.getAttribute('normal')
    const indexed = geo.getIndex()
    const push = (i: number) => {
      const y = pos.getY(i)
      positions.push(pos.getX(i), y, pos.getZ(i))
      normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
      const top = Math.min(1, y / 0.9)
      colors.push(
        srgbByteToLinear(54 + top * 40),
        srgbByteToLinear(104 + top * 48),
        srgbByteToLinear(52 + top * 22),
      )
    }
    if (indexed) {
      for (let i = 0; i < indexed.count; i++) push(indexed.getX(i))
    }
    geo.dispose()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geo
}

function lawnMaterial(): THREE.MeshStandardMaterial {
  const source = groundLayerTextures()[0]
  const map = source ? source.clone() : null
  if (map) {
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    map.colorSpace = THREE.SRGBColorSpace
    map.needsUpdate = true
  }
  return new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : '#6f8f4e',
    map,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.2,
  })
}

/** Meadow or asphalt outside the plot, meeting the terrain on its edge, plus a horizon ridge. */
export function createSurround(): Surround {
  const group = new THREE.Group()
  group.name = 'surround'
  const meadowMat = lawnMaterial()
  const meadow = new THREE.Mesh(new THREE.BufferGeometry(), meadowMat)
  meadow.name = 'surround'
  meadow.receiveShadow = true
  noRaycast(meadow)
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: ASPHALT_ROUGHNESS,
    metalness: 0,
    envMapIntensity: GROUND_ENV_INTENSITY,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const asphalt = new THREE.Mesh(new THREE.BufferGeometry(), asphaltMat)
  asphalt.name = 'surround'
  asphalt.receiveShadow = true
  noRaycast(asphalt)
  const trees = makeTrees()
  const hedgeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.2,
  })
  const hedges = new THREE.InstancedMesh(hedgeGeometry(), hedgeMat, HEDGE_COUNT)
  hedges.name = 'hedgerow'
  hedges.frustumCulled = false
  noRaycast(hedges)
  const ridgeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.15,
  })
  const ridge = new THREE.Mesh(ridgeGeometry(), ridgeMat)
  ridge.name = 'horizon'
  ridge.frustumCulled = false
  noRaycast(ridge)
  group.add(meadow)
  group.add(asphalt)
  group.add(trees.group)
  group.add(hedges)
  group.add(ridge)
  const dummy = new THREE.Object3D()
  let placed = ''
  let fieldKey = ''
  let heightRef: Terrain['heights'] | null = null

  const place = (terrain: Terrain) => {
    const reach = Math.hypot(terrain.width, terrain.depth) * 0.5
    const key = `${reach.toFixed(1)}`
    if (key === placed) return
    placed = key
    let broadN = 0
    let coneN = 0
    for (let i = 0; i < TREE_COUNT; i++) {
      const cluster = Math.floor(i / 5)
      const angle = (cluster / 8) * Math.PI * 2 + hash(i) * 0.35
      const radius = reach + 18 + hash(i + 3) * 150
      const scale = 0.75 + hash(i + 7) * 1.15
      const conifer = hash(i + 5) > 0.45
      dummy.position.set(
        Math.cos(angle) * radius,
        GROUND_Y + roll(Math.cos(angle) * radius, Math.sin(angle) * radius),
        Math.sin(angle) * radius,
      )
      dummy.rotation.set(0, hash(i + 11) * Math.PI * 2, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      trees.trunks.setMatrixAt(i, dummy.matrix)
      if (conifer) {
        trees.conifer.setMatrixAt(coneN, dummy.matrix)
        trees.conifer.setColorAt(coneN, new THREE.Color(0x2f6e42))
        coneN += 1
      } else {
        trees.broad.setMatrixAt(broadN, dummy.matrix)
        trees.broad.setColorAt(broadN, new THREE.Color(0x6a9444))
        broadN += 1
      }
    }
    trees.broad.count = broadN
    trees.conifer.count = coneN
    if (trees.broad.instanceColor) trees.broad.instanceColor.needsUpdate = true
    if (trees.conifer.instanceColor) trees.conifer.instanceColor.needsUpdate = true
    trees.broad.instanceMatrix.needsUpdate = true
    trees.conifer.instanceMatrix.needsUpdate = true
    trees.trunks.instanceMatrix.needsUpdate = true
    for (let i = 0; i < HEDGE_COUNT; i++) {
      const row = Math.floor(i / 8)
      const along = (i % 8) - 3.5
      const angle = row === 0 ? 0.4 : 2.2
      const radius = reach + 14 + row * 6
      const x = Math.cos(angle) * radius + along * 1.15
      const z = Math.sin(angle) * radius
      dummy.position.set(x, GROUND_Y, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1.55, 0.9 + hash(i) * 0.16, 0.72)
      dummy.updateMatrix()
      hedges.setMatrixAt(i, dummy.matrix)
    }
    hedges.instanceMatrix.needsUpdate = true
  }

  const dropMat = (mesh: THREE.Mesh) => {
    const listed = mesh.material
    const materials = Array.isArray(listed) ? listed : [listed]
    for (const material of materials) {
      const mapped = material as THREE.MeshStandardMaterial
      if (mapped.map && mapped.map !== groundLayerTextures()[0]) mapped.map.dispose()
      material.dispose()
    }
  }

  return {
    group,
    sync(terrain, mode) {
      const paved = mode === 'asphalt'
      meadow.visible = !paved
      asphalt.visible = paved
      trees.group.visible = !paved
      hedges.visible = !paved
      ridge.visible = !paved
      const key = `${terrain.width}|${terrain.depth}|${terrain.resolution}|${mode}`
      if (key !== fieldKey || terrain.heights !== heightRef) {
        fieldKey = key
        heightRef = terrain.heights
        const next = buildField(terrain, mode)
        const mesh = paved ? asphalt : meadow
        mesh.geometry.dispose()
        mesh.geometry = next
      }
      if (!paved) place(terrain)
    },
    dispose() {
      meadow.geometry.dispose()
      asphalt.geometry.dispose()
      dropMat(meadow)
      dropMat(asphalt)
      trees.group.traverse((child) => {
        const mesh = child as THREE.Mesh
        mesh.geometry?.dispose()
        const listed = mesh.material
        const materials = Array.isArray(listed) ? listed : listed ? [listed] : []
        for (const material of materials) material.dispose()
      })
      hedges.geometry.dispose()
      dropMat(hedges)
      ridge.geometry.dispose()
      dropMat(ridge)
    },
  }
}
