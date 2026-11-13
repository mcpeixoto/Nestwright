import * as THREE from 'three'
import type { Terrain } from '../../model/types'

const DISC_RADIUS = 2000
const GROUND_Y = -0.45
const SKIRT = 8

export interface Surround {
  group: THREE.Group
  sync(terrain: Terrain): void
  dispose(): void
}

function hash(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function noRaycast(object: THREE.Object3D): void {
  object.raycast = () => {}
  object.traverse((child) => {
    child.raycast = () => {}
  })
}

function makeDisc(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(DISC_RADIUS, 72)
  const colors = new Float32Array(geo.attributes.position.count * 3)
  const position = geo.attributes.position
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(1, Math.hypot(position.getX(i), position.getY(i)) / DISC_RADIUS)
    const fade = t * t
    colors[i * 3] = 0.45 + (0.62 - 0.45) * fade
    colors[i * 3 + 1] = 0.58 + (0.72 - 0.58) * fade
    colors[i * 3 + 2] = 0.28 + (0.48 - 0.28) * fade
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  )
  mesh.position.y = GROUND_Y
  mesh.name = 'surround'
  mesh.receiveShadow = true
  noRaycast(mesh)
  return mesh
}

function makeTrees(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'treeline'
  const count = 110
  const foliage = new THREE.ConeGeometry(2.4, 9, 5)
  foliage.translate(0, 6.2, 0)
  const trunks = new THREE.CylinderGeometry(0.28, 0.38, 2.2, 5)
  trunks.translate(0, 1.1, 0)
  const leaves = new THREE.InstancedMesh(
    foliage,
    new THREE.MeshStandardMaterial({ color: '#2f4a34', roughness: 1, metalness: 0 }),
    count,
  )
  const wood = new THREE.InstancedMesh(
    trunks,
    new THREE.MeshStandardMaterial({ color: '#3a3228', roughness: 0.9, metalness: 0 }),
    count,
  )
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + hash(i) * 0.04
    const radius = 320 + hash(i + 3) * 260
    const scale = 0.7 + hash(i + 7) * 1.1
    dummy.position.set(Math.cos(angle) * radius, GROUND_Y, Math.sin(angle) * radius)
    dummy.rotation.y = hash(i + 11) * Math.PI * 2
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    leaves.setMatrixAt(i, dummy.matrix)
    wood.setMatrixAt(i, dummy.matrix)
    color.setHex(hash(i + 5) > 0.5 ? 0x34543a : 0x243628)
    leaves.setColorAt(i, color)
  }
  leaves.instanceMatrix.needsUpdate = true
  wood.instanceMatrix.needsUpdate = true
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true
  noRaycast(leaves)
  noRaycast(wood)
  group.add(wood)
  group.add(leaves)
  return group
}

function skirtGeometry(terrain: Terrain): THREE.BufferGeometry | null {
  const n = terrain.resolution
  const count = (n + 1) * (n + 1)
  if (n < 1 || terrain.width <= 0 || terrain.depth <= 0 || terrain.heights.length < count) return null
  const positions: number[] = []
  const colors: number[] = []
  const at = (ix: number, iy: number): [number, number, number] => {
    const x = -terrain.width / 2 + (ix / n) * terrain.width
    const z = -terrain.depth / 2 + (iy / n) * terrain.depth
    const h = terrain.heights[iy * (n + 1) + ix]
    return [x, Number.isFinite(h) ? h : 0, z]
  }
  const drop = (v: [number, number, number]): [number, number, number] => {
    const len = Math.hypot(v[0], v[2]) || 1
    return [v[0] + (v[0] / len) * SKIRT, GROUND_Y, v[2] + (v[2] / len) * SKIRT]
  }
  const push = (v: [number, number, number], meadow: boolean) => {
    positions.push(v[0], v[1], v[2])
    if (meadow) colors.push(0.49, 0.6, 0.32)
    else colors.push(0.43, 0.55, 0.3)
  }
  const quad = (a: [number, number, number], b: [number, number, number]) => {
    const c = drop(a)
    const d = drop(b)
    for (const v of [a, b, d, a, d, c]) push(v, v[1] === GROUND_Y)
  }
  for (let i = 0; i < n; i++) {
    quad(at(i, 0), at(i + 1, 0))
    quad(at(i + 1, n), at(i, n))
    quad(at(0, i + 1), at(0, i))
    quad(at(n, i), at(n, i + 1))
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

/** Meadow disc, a sloped skirt under the plot edge, and a horizon tree line. */
export function createSurround(): Surround {
  const group = new THREE.Group()
  group.name = 'surround'
  const disc = makeDisc()
  const trees = makeTrees()
  group.add(disc)
  group.add(trees)
  let skirt: THREE.Mesh | null = null
  const skirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })

  return {
    group,
    sync(terrain) {
      const geo = skirtGeometry(terrain)
      if (!geo) {
        if (skirt) skirt.visible = false
        return
      }
      if (!skirt) {
        skirt = new THREE.Mesh(geo, skirtMat)
        skirt.name = 'skirt'
        skirt.receiveShadow = true
        noRaycast(skirt)
        group.add(skirt)
        return
      }
      skirt.geometry.dispose()
      skirt.geometry = geo
      skirt.visible = true
    },
    dispose() {
      disc.geometry.dispose()
      const discMat = disc.material
      if (!Array.isArray(discMat)) discMat.dispose()
      skirt?.geometry.dispose()
      skirtMat.dispose()
      trees.traverse((child) => {
        const mesh = child as THREE.Mesh
        mesh.geometry?.dispose()
        const listed = mesh.material
        const materials = Array.isArray(listed) ? listed : listed ? [listed] : []
        for (const material of materials) material.dispose()
      })
    },
  }
}
