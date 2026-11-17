import * as THREE from 'three'
import { getEntry } from '../catalog/registry'
import { isFlatItem } from '../model/clearance'
import type { Item } from '../model/types'

/**
 * Baked contact shadows: the soft darkening where furniture meets the floor.
 *
 * Screen-space AO runs at reduced resolution with a room-sized radius, so it cannot see a
 * chair leg, and the Low tier has none at all: furniture read as hovering. Each item instead
 * gets a floor decal baked from its own triangles. A height field holds, per floor cell, the
 * lowest geometry above it; occlusion falls with that height (a leg on the floor is dark and
 * tight, a sofa body 10 cm up shades a soft patch, a table top 70 cm up barely registers), and
 * each height band spreads by its own radius. The decal is cached per model and size.
 */
export const CONTACT = {
  /** Floor cells per metre, capped at `maxCells` per side. */
  cellsPerMetre: 64,
  maxCells: 128,
  /** Decal border beyond the footprint, metres. */
  margin: 0.3,
  /** Geometry higher than this above the floor casts nothing. */
  reach: 0.9,
  /** Height at which occlusion halves. */
  halfHeight: 0.22,
  /** Height bands (metres) and the spread of each: higher geometry casts a wider, fainter shade. */
  bands: [0, 0.12, 0.35, 0.75],
  spreadAtFloor: 0.02,
  spreadPerMetre: 0.3,
  /** Fade over the last stretch of the border so the decal never shows an edge. */
  edgeFade: 0.12,
  strength: 0.62,
  maxAlpha: 0.7,
  /** Lift above the floor it lies on (metres). */
  lift: 0.003,
} as const

export interface HeightField {
  nx: number
  nz: number
  minX: number
  minZ: number
  cell: number
  /** Lowest geometry above each cell (row-major, z rows); Infinity where nothing is above. */
  heights: Float32Array
}

interface Footprint {
  w: number
  d: number
}

/** Rasterise triangles (flat xyz per vertex, three vertices per triangle) into a height field. */
export function heightField(positions: ArrayLike<number>, footprint: Footprint): HeightField {
  let minX = -footprint.w / 2
  let maxX = footprint.w / 2
  let minZ = -footprint.d / 2
  let maxZ = footprint.d / 2
  // Low geometry outside the nominal box (a model a little wider than its slot) still counts.
  for (let i = 0; i + 2 < positions.length; i += 3) {
    if (positions[i + 1]! > CONTACT.reach) continue
    minX = Math.min(minX, positions[i]!)
    maxX = Math.max(maxX, positions[i]!)
    minZ = Math.min(minZ, positions[i + 2]!)
    maxZ = Math.max(maxZ, positions[i + 2]!)
  }
  minX -= CONTACT.margin
  maxX += CONTACT.margin
  minZ -= CONTACT.margin
  maxZ += CONTACT.margin
  const span = Math.max(maxX - minX, maxZ - minZ)
  const cell = Math.max(1 / CONTACT.cellsPerMetre, span / CONTACT.maxCells)
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell))
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell))
  const heights = new Float32Array(nx * nz).fill(Number.POSITIVE_INFINITY)
  const put = (x: number, y: number, z: number) => {
    const i = Math.floor((x - minX) / cell)
    const j = Math.floor((z - minZ) / cell)
    if (i < 0 || j < 0 || i >= nx || j >= nz) return
    const k = j * nx + i
    const h = Math.max(0, y)
    if (h < heights[k]!) heights[k] = h
  }
  for (let t = 0; t + 8 < positions.length; t += 9) {
    const ax = positions[t]!
    const ay = positions[t + 1]!
    const az = positions[t + 2]!
    const bx = positions[t + 3]!
    const by = positions[t + 4]!
    const bz = positions[t + 5]!
    const cx = positions[t + 6]!
    const cy = positions[t + 7]!
    const cz = positions[t + 8]!
    if (Math.min(ay, by, cy) > CONTACT.reach) continue
    // Edges, sampled at half a cell: vertical faces (leg sides, box sides) have no area in plan.
    const edges: [number, number, number, number, number, number][] = [
      [ax, ay, az, bx, by, bz],
      [bx, by, bz, cx, cy, cz],
      [cx, cy, cz, ax, ay, az],
    ]
    for (const [x0, y0, z0, x1, y1, z1] of edges) {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (cell * 0.5)) + 1
      for (let s = 0; s <= n; s++) {
        const f = s / n
        put(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f)
      }
    }
    // Interior, at cell centres (barycentric in plan).
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
    if (Math.abs(area) < 1e-10) continue
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cell))
    const i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - minX) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cell))
    const j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - minZ) / cell))
    for (let j = j0; j <= j1; j++) {
      const pz = minZ + (j + 0.5) * cell
      for (let i = i0; i <= i1; i++) {
        const px = minX + (i + 0.5) * cell
        const u = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / area
        const v = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / area
        const w = 1 - u - v
        if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue
        const k = j * nx + i
        const h = Math.max(0, u * ay + v * by + w * cy)
        if (h < heights[k]!) heights[k] = h
      }
    }
  }
  return { nx, nz, minX, minZ, cell, heights }
}

/** Occlusion of geometry `h` metres above the floor, 1 on contact. */
export function heightOcclusion(h: number): number {
  if (!(h <= CONTACT.reach)) return 0
  const r = h / CONTACT.halfHeight
  return 1 / (1 + r * r)
}

/** Max-of-gaussians spread along one axis (separable: the 2-D kernel is a product). */
function spreadAxis(src: Float32Array, nx: number, nz: number, sigmaCells: number, alongX: boolean): Float32Array {
  const out = new Float32Array(src.length)
  const reach = Math.max(1, Math.ceil(sigmaCells * 3))
  const kernel = new Float32Array(reach + 1)
  for (let k = 0; k <= reach; k++) kernel[k] = Math.exp(-(k * k) / (2 * sigmaCells * sigmaCells))
  const lines = alongX ? nz : nx
  const len = alongX ? nx : nz
  for (let line = 0; line < lines; line++) {
    for (let p = 0; p < len; p++) {
      let best = 0
      const lo = Math.max(0, p - reach)
      const hi = Math.min(len - 1, p + reach)
      for (let q = lo; q <= hi; q++) {
        const v = src[alongX ? line * nx + q : q * nx + line]!
        if (v <= 0) continue
        const s = v * kernel[Math.abs(q - p)]!
        if (s > best) best = s
      }
      out[alongX ? line * nx + p : p * nx + line] = best
    }
  }
  return out
}

/** Decal alpha (0..1) per cell, row-major with z rows, from a height field. */
export function contactAlpha(field: HeightField): Float32Array {
  const { nx, nz, cell, heights } = field
  const bands = CONTACT.bands
  const keep = new Float32Array(nx * nz).fill(1)
  for (let b = 0; b < bands.length; b++) {
    const layer = new Float32Array(nx * nz)
    let any = false
    for (let k = 0; k < heights.length; k++) {
      const h = heights[k]!
      if (!(h <= CONTACT.reach)) continue
      let nearest = 0
      for (let c = 1; c < bands.length; c++) if (Math.abs(h - bands[c]!) < Math.abs(h - bands[nearest]!)) nearest = c
      if (nearest !== b) continue
      layer[k] = heightOcclusion(h)
      any = true
    }
    if (!any) continue
    const sigma = (CONTACT.spreadAtFloor + CONTACT.spreadPerMetre * bands[b]!) / cell
    const spread = spreadAxis(spreadAxis(layer, nx, nz, sigma, true), nx, nz, sigma, false)
    for (let k = 0; k < keep.length; k++) keep[k]! *= 1 - spread[k]!
  }
  const alpha = new Float32Array(nx * nz)
  const fadeCells = CONTACT.edgeFade / cell
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const border = Math.min(i + 0.5, nx - i - 0.5, j + 0.5, nz - j - 0.5)
      const t = Math.min(1, Math.max(0, border / fadeCells))
      const fade = t * t * (3 - 2 * t)
      const k = j * nx + i
      alpha[k] = Math.min(CONTACT.maxAlpha, (1 - keep[k]!) * CONTACT.strength * fade)
    }
  }
  return alpha
}

/** Triangles of every visible mesh under `root`, in `root`'s own space. */
function collectTriangles(root: THREE.Object3D): Float32Array {
  root.updateMatrixWorld(true)
  const toRoot = root.matrixWorld.clone().invert()
  const out: number[] = []
  const v = new THREE.Vector3()
  const m = new THREE.Matrix4()
  const inst = new THREE.Matrix4()
  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || node.userData.contactShadow) return
    // The size envelope (catalog `occupy`) is an invisible box for bounds, not furniture.
    if (node.userData.envelope) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (materials.every((material) => !material || material.visible === false)) return
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    const index = mesh.geometry.getIndex()
    const count = index ? index.count : pos.count
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null
    const copies = instanced ? instanced.count : 1
    for (let c = 0; c < copies; c++) {
      m.multiplyMatrices(toRoot, mesh.matrixWorld)
      if (instanced) {
        instanced.getMatrixAt(c, inst)
        m.multiply(inst)
      }
      for (let n = 0; n + 2 < count; n += 3) {
        for (let k = 0; k < 3; k++) {
          const at = index ? index.getX(n + k) : n + k
          v.fromBufferAttribute(pos, at).applyMatrix4(m)
          out.push(v.x, v.y, v.z)
        }
      }
    }
  })
  return new Float32Array(out)
}

interface Baked {
  material: THREE.MeshBasicMaterial
  width: number
  depth: number
  centreX: number
  centreZ: number
  users: number
}

const baked = new Map<string, Baked | null>()
const KEEP_UNUSED = 96

function bake(root: THREE.Object3D, footprint: Footprint): Baked | null {
  const field = heightField(collectTriangles(root), footprint)
  let contact = false
  for (const h of field.heights) {
    if (h <= CONTACT.reach) {
      contact = true
      break
    }
  }
  if (!contact) return null
  const alpha = contactAlpha(field)
  const { nx, nz, cell, minX, minZ } = field
  // The plane is laid flat by rotateX(-90°), which puts uv v = 0 at +z: texture row 0 is the
  // field's last (largest z) row.
  const data = new Uint8Array(nx * nz * 4)
  for (let j = 0; j < nz; j++) {
    const row = nz - 1 - j
    for (let i = 0; i < nx; i++) {
      const value = Math.round(alpha[row * nx + i]! * 255)
      const o = (j * nx + i) * 4
      data[o] = value
      data[o + 1] = value
      data[o + 2] = value
      data[o + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat)
  texture.colorSpace = THREE.NoColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  material.name = 'contact-shadow'
  return { material, width: nx * cell, depth: nz * cell, centreX: minX + (nx * cell) / 2, centreZ: minZ + (nz * cell) / 2, users: 0 }
}

function noRaycast(): void {}

/** A contact-shadow decal for `root` (in its own space, at the floor), cached under `key`. */
export function contactShadowFromObject(root: THREE.Object3D, footprint: Footprint, key: string): THREE.Mesh | null {
  let entry = baked.get(key)
  if (entry === undefined) {
    entry = bake(root, footprint)
    baked.set(key, entry)
  }
  if (!entry) return null
  entry.users += 1
  const geometry = new THREE.PlaneGeometry(entry.width, entry.depth)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(entry.centreX, 0, entry.centreZ)
  const mesh = new THREE.Mesh(geometry, entry.material)
  mesh.name = 'contact-shadow'
  mesh.position.y = CONTACT.lift
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = -1
  mesh.raycast = noRaycast
  mesh.userData.contactShadow = key
  return mesh
}

function cacheKey(root: THREE.Object3D, item: Item): string {
  const size = `${item.size.w.toFixed(3)}|${item.size.d.toFixed(3)}|${item.size.h.toFixed(3)}`
  const scanned = root.userData.scanned
  if (typeof scanned === 'string') return `scan|${scanned}|${size}`
  return `${item.catalogId}|${size}|${JSON.stringify(item.params ?? {})}`
}

/** The decal for a built item (`buildItem`), or null for items that do not stand on the floor. */
export function contactShadowFor(root: THREE.Object3D, item: Item): THREE.Mesh | null {
  if (!(Math.abs(item.elevation) <= 0.05)) return null
  if (isFlatItem(item)) return null
  const entry = getEntry(item.catalogId)
  if (entry?.mount === 'wall' || entry?.mount === 'ceiling') return null
  return contactShadowFromObject(root, { w: item.size.w, d: item.size.d }, cacheKey(root, item))
}

/** Drop a decal made here; textures nobody uses are freed once the cache grows. */
export function releaseContactShadow(mesh: THREE.Mesh): void {
  const key = mesh.userData.contactShadow
  mesh.geometry.dispose()
  if (typeof key !== 'string') return
  const entry = baked.get(key)
  if (entry) entry.users = Math.max(0, entry.users - 1)
  if (baked.size <= KEEP_UNUSED) return
  for (const [k, e] of baked) {
    if (baked.size <= KEEP_UNUSED) break
    if (e && e.users > 0) continue
    if (e) {
      e.material.alphaMap?.dispose()
      e.material.dispose()
    }
    baked.delete(k)
  }
}
