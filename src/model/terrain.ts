import {
  add,
  closestPointOnSegment,
  dist,
  dot,
  len,
  normalize,
  perp,
  pointInPolygon,
  polygonArea,
  scale,
  segmentIntersection,
  signedDistanceToPolygon,
  sub,
} from './geometry'
import { detectRooms } from './rooms'
import type { GroundLayer, Level, Project, Terrain, Vec2, Wall } from './types'
import { GROUND_LAYERS } from './types'
import { pointAlongWall } from './walls'

export const PLANT_SPECIES = [
  'oak',
  'birch',
  'pine',
  'cypress',
  'palm',
  'olive',
  'fruit-tree',
  'bush-round',
  'bush-flowering',
  'hedge-segment',
  'flowers-mixed',
  'sunflowers',
  'lavender',
  'tall-grass',
  'reeds',
  'rock-small',
  'rock-large',
] as const

export type PlantSpecies = (typeof PLANT_SPECIES)[number]

export const FENCE_STYLES = ['picket', 'slatted-wood', 'metal-rails', 'stone-wall', 'hedge', 'glass'] as const

/** Plan tint for each ground layer, RGB 0..255, same order as GROUND_LAYERS. */
export const LAYER_RGB: readonly (readonly [number, number, number])[] = [
  [125, 174, 98],
  [197, 211, 106],
  [183, 177, 166],
  [154, 163, 168],
  [230, 210, 164],
  [141, 91, 60],
  [166, 132, 98],
  [77, 92, 60],
]

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_REV: number[] = []
for (let i = 0; i < B64.length; i++) B64_REV[B64.charCodeAt(i)] = i

export function speciesProfile(species: string): { spacing: number; density: number } {
  switch (species) {
    case 'oak':
    case 'birch':
    case 'pine':
    case 'cypress':
    case 'palm':
    case 'olive':
    case 'fruit-tree':
      return { spacing: 4, density: 0.035 }
    case 'bush-round':
    case 'bush-flowering':
      return { spacing: 0.9, density: 0.7 }
    case 'hedge-segment':
      return { spacing: 0.75, density: 1.1 }
    case 'flowers-mixed':
    case 'sunflowers':
    case 'lavender':
      return { spacing: 0.35, density: 3.5 }
    case 'tall-grass':
    case 'reeds':
      return { spacing: 0.22, density: 6 }
    case 'rock-small':
      return { spacing: 0.8, density: 0.4 }
    case 'rock-large':
      return { spacing: 1.6, density: 0.12 }
    default:
      return { spacing: 1, density: 0.4 }
  }
}

export function waterDepth(body: { kind: string; depth?: number }): number {
  if (typeof body.depth === 'number' && Number.isFinite(body.depth)) return Math.max(0.05, body.depth)
  if (body.kind === 'pool') return 1.4
  if (body.kind === 'stream') return 0.3
  return 0.45
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function gridSize(resolution: number): number {
  return resolution + 1
}

export function gridIndex(ix: number, iy: number, resolution: number): number {
  return iy * (resolution + 1) + ix
}

export function worldToGrid(terrain: Terrain, x: number, y: number): { x: number; y: number } {
  if (terrain.width <= 0 || terrain.depth <= 0 || terrain.resolution <= 0) return { x: 0, y: 0 }
  return {
    x: ((x + terrain.width / 2) / terrain.width) * terrain.resolution,
    y: ((y + terrain.depth / 2) / terrain.depth) * terrain.resolution,
  }
}

export function gridToWorld(terrain: Terrain, ix: number, iy: number): Vec2 {
  const n = terrain.resolution
  if (n <= 0) return { x: 0, y: 0 }
  return {
    x: -terrain.width / 2 + (ix / n) * terrain.width,
    y: -terrain.depth / 2 + (iy / n) * terrain.depth,
  }
}

function heightAt(terrain: Terrain, ix: number, iy: number): number {
  const n = terrain.resolution
  const x = clamp(ix, 0, n)
  const y = clamp(iy, 0, n)
  const value = terrain.heights[gridIndex(x, y, n)]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Bilinear height sample. Outside the plot clamps to the edge. */
export function sampleHeight(terrain: Terrain, x: number, y: number): number {
  if (terrain.resolution < 1 || terrain.heights.length === 0) return 0
  const g = worldToGrid(terrain, x, y)
  const n = terrain.resolution
  const gx = clamp(g.x, 0, n)
  const gy = clamp(g.y, 0, n)
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const x1 = Math.min(n, x0 + (gx > x0 ? 1 : 0))
  const y1 = Math.min(n, y0 + (gy > y0 ? 1 : 0))
  const tx = gx - x0
  const ty = gy - y0
  const h00 = heightAt(terrain, x0, y0)
  const h10 = heightAt(terrain, x1, y0)
  const h01 = heightAt(terrain, x0, y1)
  const h11 = heightAt(terrain, x1, y1)
  const a = h00 * (1 - tx) + h10 * tx
  const b = h01 * (1 - tx) + h11 * tx
  return a * (1 - ty) + b * ty
}

/** Smooth cosine falloff. Zero at and beyond `radius`. */
export function brushFalloff(distance: number, radius: number): number {
  if (!(radius > 0) || distance >= radius || distance < 0) return 0
  const t = distance / radius
  return 0.5 + 0.5 * Math.cos(Math.PI * t)
}

function brushReady(terrain: Terrain, radius: number): boolean {
  const need = (terrain.resolution + 1) * (terrain.resolution + 1)
  return terrain.resolution >= 1 && terrain.width > 0 && terrain.depth > 0 && terrain.heights.length >= need && radius > 0
}

function forEachBrush(
  terrain: Terrain,
  center: Vec2,
  radius: number,
  visit: (index: number, falloff: number, ix: number, iy: number) => void,
): void {
  if (!brushReady(terrain, radius)) return
  const n = terrain.resolution
  const g = worldToGrid(terrain, center.x, center.y)
  const cellW = terrain.width / n
  const cellD = terrain.depth / n
  const rx = Math.ceil(radius / Math.max(cellW, 1e-6))
  const ry = Math.ceil(radius / Math.max(cellD, 1e-6))
  const ix0 = Math.max(0, Math.floor(g.x) - rx)
  const ix1 = Math.min(n, Math.ceil(g.x) + rx)
  const iy0 = Math.max(0, Math.floor(g.y) - ry)
  const iy1 = Math.min(n, Math.ceil(g.y) + ry)
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const world = gridToWorld(terrain, ix, iy)
      const falloff = brushFalloff(Math.hypot(world.x - center.x, world.y - center.y), radius)
      if (falloff <= 0) continue
      visit(gridIndex(ix, iy, n), falloff, ix, iy)
    }
  }
}

export function raise(terrain: Terrain, center: Vec2, radius: number, strength: number): void {
  if (!Number.isFinite(strength) || strength === 0) return
  forEachBrush(terrain, center, radius, (index, falloff) => {
    terrain.heights[index] = (terrain.heights[index] ?? 0) + strength * falloff
  })
}

export function lower(terrain: Terrain, center: Vec2, radius: number, strength: number): void {
  raise(terrain, center, radius, -Math.abs(strength))
}

/** Move samples toward `target` (the height under the brush when the stroke began). */
export function flatten(terrain: Terrain, center: Vec2, radius: number, target: number, strength: number): void {
  if (!Number.isFinite(target)) return
  const blend = clamp01(strength)
  forEachBrush(terrain, center, radius, (index, falloff) => {
    const current = terrain.heights[index] ?? 0
    terrain.heights[index] = current + (target - current) * blend * falloff
  })
}

/** Box-blur samples inside the brush, then blend back by `strength`. */
export function smooth(terrain: Terrain, center: Vec2, radius: number, strength: number): void {
  if (!brushReady(terrain, radius)) return
  const blend = clamp01(strength)
  if (blend <= 0) return
  const copy = terrain.heights.slice()
  const n = terrain.resolution
  const cell = Math.max(terrain.width, terrain.depth) / n
  forEachBrush(terrain, center, radius, (index, falloff, ix, iy) => {
    const reach = radius
    const radCells = Math.max(1, Math.ceil(reach / Math.max(cell, 1e-6)))
    const step = Math.max(1, Math.floor(radCells / 6))
    let sum = 0
    let count = 0
    const here = gridToWorld(terrain, ix, iy)
    for (let y = iy - radCells; y <= iy + radCells; y += step) {
      if (y < 0 || y > n) continue
      for (let x = ix - radCells; x <= ix + radCells; x += step) {
        if (x < 0 || x > n) continue
        const wp = gridToWorld(terrain, x, y)
        if (Math.hypot(wp.x - here.x, wp.y - here.y) > reach) continue
        sum += copy[gridIndex(x, y, n)] ?? 0
        count++
      }
    }
    if (count === 0) return
    const current = copy[index] ?? 0
    terrain.heights[index] = current + (sum / count - current) * blend * falloff
  })
}

/** Set every height sample to `height`. */
export function level(terrain: Terrain, height: number): void {
  const h = Number.isFinite(height) ? height : 0
  for (let i = 0; i < terrain.heights.length; i++) terrain.heights[i] = h
}

export function encodeSplat(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0
    const n = (b0 << 16) | (b1 << 8) | b2
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return out
}

function lawnWeights(length: number): Uint8Array {
  const out = new Uint8Array(Math.max(0, length))
  for (let i = 0; i < out.length; i += GROUND_LAYERS.length) out[i] = 255
  return out
}

/** Decode a splat. A length mismatch (corrupt or stale) comes back as pure lawn of `expectedLength`. */
export function decodeSplat(data: string, expectedLength?: number): Uint8Array {
  const clean = data.replace(/\s/g, '')
  let pad = 0
  if (clean.endsWith('==')) pad = 2
  else if (clean.endsWith('=')) pad = 1
  const outLen = clean.length === 0 ? 0 : Math.max(0, Math.floor(clean.length / 4) * 3 - pad)
  if (expectedLength != null && expectedLength !== outLen) return lawnWeights(expectedLength)
  const out = new Uint8Array(outLen)
  let o = 0
  for (let i = 0; i + 3 < clean.length; i += 4) {
    const c0 = B64_REV[clean.charCodeAt(i)] ?? 0
    const c1 = B64_REV[clean.charCodeAt(i + 1)] ?? 0
    const c2 = clean[i + 2] === '=' ? 0 : (B64_REV[clean.charCodeAt(i + 2)] ?? 0)
    const c3 = clean[i + 3] === '=' ? 0 : (B64_REV[clean.charCodeAt(i + 3)] ?? 0)
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (clean[i + 2] !== '=' && o < out.length) out[o++] = (n >> 8) & 255
    if (clean[i + 3] !== '=' && o < out.length) out[o++] = n & 255
  }
  return out
}

export function splatLength(terrain: Terrain): number {
  const n = terrain.resolution + 1
  return n * n * GROUND_LAYERS.length
}

function layerIndex(layer: GroundLayer | number): number {
  if (typeof layer === 'number') return clamp(layer, 0, GROUND_LAYERS.length - 1)
  const found = GROUND_LAYERS.indexOf(layer)
  return found < 0 ? 0 : found
}

function writeNormalized(weights: Uint8Array, sample: number, values: number[]): void {
  const base = sample * GROUND_LAYERS.length
  let acc = 0
  let maxI = 0
  for (let i = 0; i < GROUND_LAYERS.length; i++) {
    const q = Math.round(values[i] ?? 0)
    const clamped = clamp(q, 0, 255)
    weights[base + i] = clamped
    acc += clamped
    if ((values[i] ?? 0) > (values[maxI] ?? 0)) maxI = i
  }
  const drift = 255 - acc
  weights[base + maxI] = clamp((weights[base + maxI] ?? 0) + drift, 0, 255)
}

/** Raise one layer and scale the others so the sample still sums to 255. `amount` is 0..1. */
function blendSample(weights: Uint8Array, sample: number, layer: number, amount: number): void {
  const f = clamp01(amount)
  if (f <= 0) return
  const base = sample * GROUND_LAYERS.length
  const next: number[] = []
  for (let i = 0; i < GROUND_LAYERS.length; i++) {
    const cur = weights[base + i] ?? 0
    next.push(i === layer ? cur + (255 - cur) * f : cur * (1 - f))
  }
  writeNormalized(weights, sample, next)
}

export function dominantLayer(weights: Uint8Array, sample: number): number {
  const base = sample * GROUND_LAYERS.length
  let best = 0
  let bestW = -1
  for (let i = 0; i < GROUND_LAYERS.length; i++) {
    const w = weights[base + i] ?? 0
    if (w > bestW) {
      bestW = w
      best = i
    }
  }
  return best
}

export function paintLayer(
  terrain: Terrain,
  layer: GroundLayer | number,
  center: Vec2,
  radius: number,
  strength: number,
): void {
  if (!brushReady(terrain, radius)) return
  const weights = decodeSplat(terrain.splat, splatLength(terrain))
  const target = layerIndex(layer)
  const gain = clamp01(strength)
  forEachBrush(terrain, center, radius, (index, falloff) => {
    blendSample(weights, index, target, gain * falloff)
  })
  terrain.splat = encodeSplat(weights)
}

export function distanceToPolyline(point: Vec2, points: readonly Vec2[], closed = false): number {
  if (points.length === 0) return Infinity
  const first = points[0]
  if (!first) return Infinity
  if (points.length === 1) return dist(point, first)
  let min = Infinity
  const spans = closed ? points.length : points.length - 1
  for (let i = 0; i < spans; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (!a || !b) continue
    min = Math.min(min, dist(point, closestPointOnSegment(point, a, b).point))
  }
  return min
}

export interface PathCell {
  index: number
  weight: number
}

/** Cells the path covers, with a smooth weight across `width`. */
export function pathWeights(terrain: Terrain, points: readonly Vec2[], width: number): PathCell[] {
  if (!brushReady(terrain, Math.max(width, 0.01)) || points.length === 0 || !(width > 0)) return []
  const radius = width / 2
  const n = terrain.resolution
  const out: PathCell[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const g0 = worldToGrid(terrain, minX - radius, minY - radius)
  const g1 = worldToGrid(terrain, maxX + radius, maxY + radius)
  const ix0 = Math.max(0, Math.floor(Math.min(g0.x, g1.x)))
  const iy0 = Math.max(0, Math.floor(Math.min(g0.y, g1.y)))
  const ix1 = Math.min(n, Math.ceil(Math.max(g0.x, g1.x)))
  const iy1 = Math.min(n, Math.ceil(Math.max(g0.y, g1.y)))
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const world = gridToWorld(terrain, ix, iy)
      const weight = brushFalloff(distanceToPolyline(world, points, false), radius)
      if (weight <= 0) continue
      out.push({ index: gridIndex(ix, iy, n), weight })
    }
  }
  return out
}

export function paintPath(terrain: Terrain, points: readonly Vec2[], width: number, layer: GroundLayer | number): void {
  const cells = pathWeights(terrain, points, width)
  if (cells.length === 0) return
  const weights = decodeSplat(terrain.splat, splatLength(terrain))
  const target = layerIndex(layer)
  for (const cell of cells) blendSample(weights, cell.index, target, cell.weight)
  terrain.splat = encodeSplat(weights)
}

function forEachSample(terrain: Terrain, visit: (index: number, ix: number, iy: number, world: Vec2) => void): void {
  if (terrain.resolution < 1) return
  const n = terrain.resolution
  const need = (n + 1) * (n + 1)
  if (terrain.heights.length < need) return
  for (let iy = 0; iy <= n; iy++) {
    for (let ix = 0; ix <= n; ix++) visit(gridIndex(ix, iy, n), ix, iy, gridToWorld(terrain, ix, iy))
  }
}

/** Flat pad under a footprint, with a smoothstep blend across `margin` outside the outline. */
export function flattenUnderBuilding(terrain: Terrain, outline: readonly Vec2[], height: number, margin: number): void {
  if (outline.length < 3 || !brushReady(terrain, 1) || !Number.isFinite(height)) return
  const m = Math.max(0, margin)
  forEachSample(terrain, (index, _ix, _iy, world) => {
    const sd = signedDistanceToPolygon(world, outline)
    if (sd < -m) return
    const t = sd >= 0 || m <= 0 ? 1 : (sd + m) / m
    const blend = t * t * (3 - 2 * t)
    const current = terrain.heights[index] ?? 0
    terrain.heights[index] = current + (height - current) * blend
  })
}

export function boundsRing(points: readonly Vec2[], pad: number): Vec2[] | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) return null
  const p = Math.max(0, pad)
  return [
    { x: minX - p, y: minY - p },
    { x: maxX + p, y: minY - p },
    { x: maxX + p, y: maxY + p },
    { x: minX - p, y: maxY + p },
  ]
}

/** Flatten every ground-floor room (or the wall bounds if rooms have not closed yet). */
export function flattenUnderHouse(project: Project, height = -0.02, margin = 1.15): void {
  let level: Level | null = null
  for (const candidate of project.levels) {
    if (!level || candidate.elevation < level.elevation) level = candidate
  }
  if (!level) return
  const rooms = detectRooms(level)
  if (rooms.length > 0) {
    for (const room of rooms) flattenUnderBuilding(project.terrain, room.polygon, height, margin)
    return
  }
  const pts: Vec2[] = []
  for (const wall of level.walls) pts.push(wall.a, wall.b)
  const ring = boundsRing(pts, Math.max(0.2, margin * 0.25))
  if (ring) flattenUnderBuilding(project.terrain, ring, height, margin)
}

/** Drop the interior of a pool or pond bed to `floor`, blended over `blend` metres at the lip. */
export function carveBasin(terrain: Terrain, polygon: readonly Vec2[], floor: number, blend: number): void {
  if (polygon.length < 3 || !Number.isFinite(floor) || terrain.resolution < 1) return
  const b = Math.max(0.05, blend)
  forEachSample(terrain, (index, _ix, _iy, world) => {
    const sd = signedDistanceToPolygon(world, polygon)
    if (sd <= 0) return
    const t = Math.min(1, sd / b)
    const current = terrain.heights[index] ?? 0
    terrain.heights[index] = current + (floor - current) * t
  })
}

/** Paint a sand band just outside a shoreline. */
export function paintShore(terrain: Terrain, polygon: readonly Vec2[], band: number): void {
  if (polygon.length < 3 || !(band > 0) || terrain.resolution < 1) return
  const weights = decodeSplat(terrain.splat, splatLength(terrain))
  const sand = layerIndex('sand')
  let changed = false
  const n = terrain.resolution
  if (weights.length < (n + 1) * (n + 1) * GROUND_LAYERS.length) return
  for (let iy = 0; iy <= n; iy++) {
    for (let ix = 0; ix <= n; ix++) {
      const world = gridToWorld(terrain, ix, iy)
      const sd = signedDistanceToPolygon(world, polygon)
      if (sd < -band || sd > 0.15) continue
      const outside = sd >= 0 ? 0 : -sd
      const amount = 1 - outside / band
      blendSample(weights, gridIndex(ix, iy, n), sand, Math.max(0, amount))
      changed = true
    }
  }
  if (changed) terrain.splat = encodeSplat(weights)
}

function rectBoundary(width: number, depth: number): Vec2[] {
  const hw = width / 2
  const hd = depth / 2
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
}

function matchesRect(boundary: readonly Vec2[], width: number, depth: number): boolean {
  if (boundary.length !== 4) return false
  const rect = rectBoundary(width, depth)
  return rect.every((corner, i) => {
    const p = boundary[i]
    return !!p && Math.abs(p.x - corner.x) < 1e-3 && Math.abs(p.y - corner.y) < 1e-3
  })
}

function sampleWeightsAt(terrain: Terrain, decoded: Uint8Array, x: number, y: number): number[] {
  const g = worldToGrid(terrain, x, y)
  const n = Math.max(1, terrain.resolution)
  const gx = clamp(g.x, 0, n)
  const gy = clamp(g.y, 0, n)
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const x1 = Math.min(n, x0 + 1)
  const y1 = Math.min(n, y0 + 1)
  const tx = gx - x0
  const ty = gy - y0
  const corners: readonly (readonly [number, number, number])[] = [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty],
  ]
  const acc = [0, 0, 0, 0, 0, 0, 0, 0]
  for (const [ix, iy, w] of corners) {
    const base = gridIndex(ix, iy, terrain.resolution) * GROUND_LAYERS.length
    for (let layer = 0; layer < GROUND_LAYERS.length; layer++) acc[layer] = (acc[layer] ?? 0) + (decoded[base + layer] ?? 0) * w
  }
  return acc
}

/** New plot size. Heights and splat are resampled; plants, water and fences stay. */
export function resampleTerrain(terrain: Terrain, width: number, depth: number, resolution: number): Terrain {
  const res = Math.max(1, Math.round(resolution))
  const w = Math.max(1, width)
  const d = Math.max(1, depth)
  const samples = (res + 1) * (res + 1)
  const heights = new Array<number>(samples).fill(0)
  const weights = new Uint8Array(samples * GROUND_LAYERS.length)
  const old = decodeSplat(terrain.splat, splatLength(terrain))
  const probe: Terrain = { ...terrain, width: w, depth: d, resolution: res, heights, splat: '' }
  for (let iy = 0; iy <= res; iy++) {
    for (let ix = 0; ix <= res; ix++) {
      const world = gridToWorld(probe, ix, iy)
      const index = gridIndex(ix, iy, res)
      heights[index] = sampleHeight(terrain, world.x, world.y)
      writeNormalized(weights, index, sampleWeightsAt(terrain, old, world.x, world.y))
    }
  }
  return {
    enabled: terrain.enabled,
    width: w,
    depth: d,
    resolution: res,
    heights,
    splat: encodeSplat(weights),
    plants: terrain.plants.map((plant) => ({ ...plant, position: { ...plant.position } })),
    water: terrain.water.map((body) => ({
      ...body,
      polygon: body.polygon.map((p) => ({ ...p })),
    })),
    fences: terrain.fences.map((fence) => ({
      ...fence,
      points: fence.points.map((p) => ({ ...p })),
      gates: fence.gates ? [...fence.gates] : undefined,
    })),
    boundary: (matchesRect(terrain.boundary, terrain.width, terrain.depth) ? rectBoundary(w, d) : terrain.boundary).map(
      (p) => ({ ...p }),
    ),
  }
}

interface ContourSeg {
  a: Vec2
  b: Vec2
}

function contourEdgePoint(terrain: Terrain, ix: number, iy: number, edge: number, level: number): Vec2 {
  const corners: readonly (readonly [number, number])[] = [
    [ix, iy],
    [ix + 1, iy],
    [ix + 1, iy + 1],
    [ix, iy + 1],
  ]
  const pairs: readonly (readonly [number, number])[] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ]
  const pair = pairs[edge] ?? [0, 1]
  const c0 = corners[pair[0]] ?? [ix, iy]
  const c1 = corners[pair[1]] ?? [ix + 1, iy]
  const h0 = heightAt(terrain, c0[0], c0[1])
  const h1 = heightAt(terrain, c1[0], c1[1])
  const denom = h1 - h0
  const t = Math.abs(denom) < 1e-8 ? 0.5 : clamp((level - h0) / denom, 0, 1)
  const p0 = gridToWorld(terrain, c0[0], c0[1])
  const p1 = gridToWorld(terrain, c1[0], c1[1])
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }
}

const MARCH: readonly (readonly (readonly number[])[])[] = [
  [],
  [[0, 3]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[0, 3], [1, 2]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 1], [2, 3]],
  [[1, 2]],
  [[3, 1]],
  [[0, 1]],
  [[0, 3]],
  [],
]

function marchLevel(terrain: Terrain, level: number): ContourSeg[] {
  const n = terrain.resolution
  const segs: ContourSeg[] = []
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const h0 = heightAt(terrain, ix, iy)
      const h1 = heightAt(terrain, ix + 1, iy)
      const h2 = heightAt(terrain, ix + 1, iy + 1)
      const h3 = heightAt(terrain, ix, iy + 1)
      let mask = 0
      if (h0 >= level) mask |= 1
      if (h1 >= level) mask |= 2
      if (h2 >= level) mask |= 4
      if (h3 >= level) mask |= 8
      let pairs = MARCH[mask] ?? []
      if (mask === 5 || mask === 10) {
        const avg = (h0 + h1 + h2 + h3) / 4
        pairs = avg >= level ? (mask === 5 ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]]) : (MARCH[mask] ?? [])
      }
      for (const pair of pairs) {
        const e0 = pair[0]
        const e1 = pair[1]
        if (e0 == null || e1 == null) continue
        segs.push({
          a: contourEdgePoint(terrain, ix, iy, e0, level),
          b: contourEdgePoint(terrain, ix, iy, e1, level),
        })
      }
    }
  }
  return segs
}

function chainSegments(segs: readonly ContourSeg[]): Vec2[][] {
  const keyOf = (p: Vec2) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`
  const nodes = new Map<string, { p: Vec2; links: string[] }>()
  const touch = (p: Vec2) => {
    const key = keyOf(p)
    let node = nodes.get(key)
    if (!node) {
      node = { p: { x: p.x, y: p.y }, links: [] }
      nodes.set(key, node)
    }
    return { key, node }
  }
  for (const seg of segs) {
    const a = touch(seg.a)
    const b = touch(seg.b)
    if (a.key === b.key) continue
    a.node.links.push(b.key)
    b.node.links.push(a.key)
  }
  const used = new Set<string>()
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const lines: Vec2[][] = []
  for (const [startKey, startNode] of nodes) {
    for (const nextKey of startNode.links) {
      const first = edgeKey(startKey, nextKey)
      if (used.has(first)) continue
      used.add(first)
      const line = [startNode.p]
      let prev = startKey
      let cur = nextKey
      let guard = 0
      while (guard++ < segs.length + 2) {
        const node = nodes.get(cur)
        if (!node) break
        line.push(node.p)
        if (cur === startKey) break
        const nxt = node.links.find((link) => link !== prev && !used.has(edgeKey(cur, link)))
        if (!nxt) break
        used.add(edgeKey(cur, nxt))
        prev = cur
        cur = nxt
      }
      if (line.length >= 2) lines.push(line)
    }
  }
  return lines
}

/** Isolines at `interval` metres, chained with marching squares. Empty on a flat field. */
export function contourLines(terrain: Terrain, interval: number): Vec2[][] {
  if (!brushReady(terrain, 1) || !(interval > 0)) return []
  let min = Infinity
  let max = -Infinity
  for (const h of terrain.heights) {
    if (!Number.isFinite(h)) continue
    min = Math.min(min, h)
    max = Math.max(max, h)
  }
  if (!(max - min > 1e-4)) return []
  let step = interval
  const count = Math.ceil((max - min) / step)
  if (count > 80) step = (max - min) / 80
  const lines: Vec2[][] = []
  const start = Math.ceil((min + 1e-4) / step) * step
  for (let level = start; level < max - 1e-4; level += step) {
    lines.push(...chainSegments(marchLevel(terrain, level)))
  }
  return lines
}

function separated(point: Vec2, groups: readonly (readonly Vec2[])[], spacing: number): boolean {
  if (spacing <= 0) return true
  const limit = spacing * spacing
  for (const group of groups) {
    for (const other of group) {
      const dx = point.x - other.x
      const dy = point.y - other.y
      if (dx * dx + dy * dy < limit) return false
    }
  }
  return true
}

/** Rejection sampling inside a disc. Same seed, same points. */
export function scatterPoints(
  center: Vec2,
  radius: number,
  count: number,
  minSpacing: number,
  seed: number,
  existing: readonly Vec2[] = [],
): Vec2[] {
  if (!(radius > 0) || count <= 0 || !Number.isFinite(seed)) return []
  const rng = mulberry32(seed >>> 0)
  const accepted: Vec2[] = []
  const tries = Math.min(4000, Math.max(16, count * 24))
  for (let i = 0; i < tries && accepted.length < count; i++) {
    const ang = rng() * Math.PI * 2
    const rad = Math.sqrt(rng()) * radius
    const point = { x: center.x + Math.cos(ang) * rad, y: center.y + Math.sin(ang) * rad }
    if (!separated(point, [accepted, existing], minSpacing)) continue
    accepted.push(point)
  }
  return accepted
}

export function scatterFiltered(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  count: number,
  minSpacing: number,
  seed: number,
  accept: (point: Vec2) => boolean,
): Vec2[] {
  if (count <= 0 || !(maxX > minX) || !(maxY > minY)) return []
  const rng = mulberry32(seed >>> 0)
  const accepted: Vec2[] = []
  const tries = Math.min(8000, Math.max(20, count * 40))
  for (let i = 0; i < tries && accepted.length < count; i++) {
    const point = { x: minX + rng() * (maxX - minX), y: minY + rng() * (maxY - minY) }
    if (!accept(point)) continue
    if (!separated(point, [accepted], minSpacing)) continue
    accepted.push(point)
  }
  return accepted
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function paintIvy(wall: Wall, side: 'left' | 'right', delta: number): void {
  const ivy = { left: wall.ivy?.left ?? 0, right: wall.ivy?.right ?? 0 }
  ivy[side] = clamp01(ivy[side] + delta)
  wall.ivy = ivy
}

export interface IvyLeaf {
  position: Vec2
  elevation: number
  rotation: number
  scale: number
}

/** Leaf cards for one wall side. Deterministic for a wall id; none above the painted coverage. */
export function ivyLeaves(wall: Wall, side: 'left' | 'right'): IvyLeaf[] {
  const coverage = clamp01(wall.ivy?.[side] ?? 0)
  if (coverage <= 0.001) return []
  const span = dist(wall.a, wall.b)
  if (span < 0.05 || !(wall.height > 0)) return []
  const dir = normalize(sub(wall.b, wall.a))
  const normal = side === 'left' ? perp(dir) : scale(perp(dir), -1)
  const count = Math.min(480, Math.max(1, Math.round(coverage * span * wall.height * 7)))
  const rng = mulberry32(hashString(`${wall.id}:${side}`))
  const inset = wall.thickness / 2 + 0.04
  const facing = Math.atan2(normal.x, normal.y)
  const leaves: IvyLeaf[] = []
  for (let i = 0; i < count; i++) {
    const t = rng()
    const jitter = (rng() - 0.5) * 0.1
    const along = add(wall.a, scale(sub(wall.b, wall.a), t))
    leaves.push({
      position: add(along, scale(normal, inset + jitter)),
      elevation: rng() * wall.height * coverage,
      rotation: facing + (rng() - 0.5) * 0.5,
      scale: 0.75 + rng() * 0.55,
    })
  }
  return leaves
}

export function pickOutside(terrain: Terrain, point: Vec2, tolerance: number): string | null {
  const tol = Math.max(0.05, tolerance)
  let plant: { id: string; d: number } | null = null
  for (const item of terrain.plants) {
    const reach = Math.max(tol, 0.35 * Math.max(0.4, item.scale))
    const d = dist(point, item.position)
    if (d <= reach && (!plant || d < plant.d)) plant = { id: item.id, d }
  }
  if (plant) return plant.id
  for (let i = terrain.fences.length - 1; i >= 0; i--) {
    const fence = terrain.fences[i]
    if (!fence) continue
    const closed = fence.points.length >= 3 && dist(fence.points[0]!, fence.points[fence.points.length - 1]!) < 0.35
    if (distanceToPolyline(point, fence.points, closed) <= tol + 0.25) return fence.id
  }
  for (let i = terrain.water.length - 1; i >= 0; i--) {
    const body = terrain.water[i]
    if (!body) continue
    if (body.kind === 'stream') {
      if (distanceToPolyline(point, body.polygon, false) <= Math.max(0.8, tol)) return body.id
    } else if (pointInPolygon(point, body.polygon)) return body.id
  }
  return null
}

function groundLevel(project: Project): Level | null {
  let best: Level | null = null
  for (const level of project.levels) {
    if (!best || level.elevation < best.elevation) best = level
  }
  return best
}

const DOORISH = new Set(['door', 'double-door', 'sliding-door'])
const BED_OPENINGS = new Set(['door', 'double-door', 'sliding-door', 'garage-door'])
const BED_SPECIES = ['flowers-mixed', 'lavender', 'bush-flowering'] as const

function planCentroid(level: Level): Vec2 {
  let x = 0
  let y = 0
  let n = 0
  for (const wall of level.walls) {
    x += wall.a.x + wall.b.x
    y += wall.a.y + wall.b.y
    n += 2
  }
  return n > 0 ? { x: x / n, y: y / n } : { x: 0, y: 0 }
}

/** Left of `tangent`, flipped so it points away from the plan centroid. */
function awayNormal(tangent: Vec2, point: Vec2, centroid: Vec2): Vec2 {
  const out = perp(tangent)
  return dot(out, sub(point, centroid)) < 0 ? { x: -out.x, y: -out.y } : out
}

function placedOpening(level: Level, wallId: string, offset: number, centroid: Vec2): { point: Vec2; out: Vec2 } | null {
  const wall = level.walls.find((item) => item.id === wallId)
  if (!wall) return null
  const tangent = normalize(sub(wall.b, wall.a))
  if (len(tangent) < 1e-6) return null
  const point = pointAlongWall(wall, offset)
  return { point, out: awayNormal(tangent, point, centroid) }
}

function frontDoor(level: Level): { point: Vec2; out: Vec2 } | null {
  const centroid = planCentroid(level)
  let best: { point: Vec2; out: Vec2; score: number } | null = null
  for (const opening of level.openings) {
    if (!DOORISH.has(opening.type)) continue
    const placed = placedOpening(level, opening.wallId, opening.offset, centroid)
    if (!placed) continue
    // Leave through the wall, away from the middle of the plan. Scoring by
    // distance alone picks an interior door and shoots the path sideways
    // across the garden (through the family-house pool).
    const score = dot(placed.out, sub(placed.point, centroid))
    if (!best || score > best.score) best = { point: placed.point, out: placed.out, score }
  }
  return best ? { point: best.point, out: best.out } : null
}

function rayToRing(origin: Vec2, dir: Vec2, ring: readonly Vec2[]): Vec2 | null {
  if (len(dir) < 1e-6 || ring.length < 2) return null
  // Parameter t is a fraction of this reach, so the near-miss epsilon has to be in metres.
  const reach = 10000
  const far = add(origin, scale(dir, reach))
  let best = Infinity
  let hit: Vec2 | null = null
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    const found = segmentIntersection(origin, far, a, b)
    if (!found) continue
    const distance = found.t * reach
    if (distance <= 0.05 || distance >= best) continue
    best = distance
    hit = found.point
  }
  return hit
}

function fillLayer(terrain: Terrain, layer: GroundLayer): void {
  const samples = (terrain.resolution + 1) * (terrain.resolution + 1)
  const weights = new Uint8Array(samples * GROUND_LAYERS.length)
  const index = layerIndex(layer)
  for (let i = 0; i < samples; i++) weights[i * GROUND_LAYERS.length + index] = 255
  terrain.splat = encodeSplat(weights)
}

function ringOf(terrain: Terrain): Vec2[] {
  return terrain.boundary.length >= 3 ? terrain.boundary : rectBoundary(terrain.width, terrain.depth)
}

function nearStructure(level: Level, point: Vec2, clearance: number): boolean {
  for (const wall of level.walls) {
    if (distanceToPolyline(point, [wall.a, wall.b], false) < clearance + wall.thickness * 0.5) return true
  }
  return false
}

/** Distance outside the room union. Null when the point is inside a room or there is no footprint. */
function outsideFootprint(rooms: readonly { polygon: readonly Vec2[] }[], point: Vec2): number | null {
  let best = Infinity
  for (const room of rooms) {
    if (room.polygon.length < 3) continue
    const sd = signedDistanceToPolygon(point, room.polygon)
    if (sd >= 0) return null
    if (-sd < best) best = -sd
  }
  return Number.isFinite(best) ? best : null
}

function openingBlocks(level: Level, wall: Wall, along: number): boolean {
  for (const opening of level.openings) {
    if (opening.wallId !== wall.id || !BED_OPENINGS.has(opening.type)) continue
    if (Math.abs(along - opening.offset) < opening.width * 0.5 + 1.2) return true
  }
  return false
}

function frontWalls(level: Level, centroid: Vec2, front: Vec2): { wall: Wall; out: Vec2 }[] {
  const found: { wall: Wall; out: Vec2 }[] = []
  for (const wall of level.walls) {
    const tangent = normalize(sub(wall.b, wall.a))
    if (len(tangent) < 1e-6) continue
    const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
    const out = awayNormal(tangent, mid, centroid)
    if (dot(out, front) > 0) found.push({ wall, out })
  }
  return found
}

function onPatio(rooms: readonly { polygon: readonly Vec2[] }[], centroid: Vec2, back: Vec2, point: Vec2): boolean {
  const outside = outsideFootprint(rooms, point)
  if (outside === null || outside > 2.2) return false
  return dot(sub(point, centroid), back) >= 0
}

function onPoolDeck(terrain: Terrain, point: Vec2): boolean {
  for (const body of terrain.water) {
    if (body.kind !== 'pool' || body.polygon.length < 3) continue
    const sd = signedDistanceToPolygon(point, body.polygon)
    if (sd < 0 && -sd <= 1.5) return true
  }
  return false
}

function onFlowerbed(
  level: Level,
  walls: readonly { wall: Wall; out: Vec2 }[],
  rooms: readonly { polygon: readonly Vec2[] }[],
  path: readonly Vec2[] | null,
  point: Vec2,
): boolean {
  if (outsideFootprint(rooms, point) === null) return false
  if (path && distanceToPolyline(point, path, false) < 0.7) return false
  for (const { wall, out } of walls) {
    const hit = closestPointOnSegment(point, wall.a, wall.b)
    const delta = sub(point, hit.point)
    const distance = len(delta)
    if (!(distance > 0) || distance > 0.9 || dot(delta, out) <= 0) continue
    if (openingBlocks(level, wall, hit.t * dist(wall.a, wall.b))) continue
    return true
  }
  return false
}

function shootToRing(terrain: Terrain, ring: readonly Vec2[], origin: Vec2, dir: Vec2, standOff: number): Vec2[] {
  const start = add(origin, scale(dir, standOff))
  const end = rayToRing(start, dir, ring) ?? add(start, scale(dir, Math.min(terrain.width, terrain.depth) * 0.35))
  return [start, end]
}

function paintYard(terrain: Terrain, paving: (world: Vec2) => boolean, soil: (world: Vec2) => boolean): void {
  const weights = decodeSplat(terrain.splat, splatLength(terrain))
  const pave = layerIndex('paving')
  const earth = layerIndex('soil')
  const n = terrain.resolution
  let changed = false
  for (let iy = 0; iy <= n; iy++) {
    for (let ix = 0; ix <= n; ix++) {
      const world = gridToWorld(terrain, ix, iy)
      const index = gridIndex(ix, iy, n)
      if (paving(world)) {
        blendSample(weights, index, pave, 1)
        changed = true
      } else if (soil(world)) {
        blendSample(weights, index, earth, 1)
        changed = true
      }
    }
  }
  if (changed) terrain.splat = encodeSplat(weights)
}

function flowerbedPlants(
  level: Level,
  walls: readonly { wall: Wall; out: Vec2 }[],
  rooms: readonly { polygon: readonly Vec2[] }[],
  path: readonly Vec2[] | null,
  seed: number,
): Terrain['plants'] {
  const rng = mulberry32(seed ^ 0xb3d)
  const plants: Terrain['plants'] = []
  for (const { wall, out } of walls) {
    const span = dist(wall.a, wall.b)
    if (span < 0.35) continue
    const steps = Math.max(1, Math.round(span / 0.7))
    const dir = normalize(sub(wall.b, wall.a))
    for (let s = 0; s < steps; s++) {
      const along = ((s + 0.5) / steps) * span
      if (openingBlocks(level, wall, along)) continue
      const position = add(add(wall.a, scale(dir, along)), scale(out, 0.45))
      if (rooms.some((room) => pointInPolygon(position, room.polygon))) continue
      if (path && distanceToPolyline(position, path, false) < 0.7) continue
      plants.push({
        id: `bed_${seed}_${plants.length}`,
        species: BED_SPECIES[Math.floor(rng() * BED_SPECIES.length)] ?? 'flowers-mixed',
        position,
        scale: 0.8 + rng() * 0.3,
        rotation: rng() * Math.PI * 2,
      })
    }
  }
  return plants
}

/**
 * Lawn around the house, patio, driveway, pool deck and front beds, a gravel
 * path to the front door, trees inside the plot and a hedge on the boundary.
 * Same seed, same garden.
 */
export function generateGarden(project: Project, seed: number): void {
  const terrain = project.terrain
  if (!terrain || terrain.resolution < 1 || !(terrain.width > 0) || !(terrain.depth > 0)) return
  const numericSeed = Number.isFinite(seed) ? seed >>> 0 : 1
  fillLayer(terrain, 'lawn')
  const ring = ringOf(terrain)
  if (ring.length >= 3) {
    const weights = decodeSplat(terrain.splat, splatLength(terrain))
    const meadow = layerIndex('meadow')
    const n = terrain.resolution
    for (let iy = 0; iy <= n; iy++) {
      for (let ix = 0; ix <= n; ix++) {
        const world = gridToWorld(terrain, ix, iy)
        const sd = signedDistanceToPolygon(world, ring)
        if (sd < 0 || sd > 2.4) continue
        blendSample(weights, gridIndex(ix, iy, n), meadow, 0.85 * (1 - sd / 2.4))
      }
    }
    terrain.splat = encodeSplat(weights)
  }
  const level = groundLevel(project)
  const centroid = level ? planCentroid(level) : { x: 0, y: 0 }
  const door = level ? frontDoor(level) : null
  const front = door ? door.out : { x: 0, y: -1 }
  const back = { x: -front.x, y: -front.y }
  const rooms = level ? detectRooms(level) : []
  const fronts = level ? frontWalls(level, centroid, front) : []
  const path = door && ring.length >= 2 ? shootToRing(terrain, ring, door.point, door.out, 0.75) : null
  const drives: Vec2[][] = []
  if (level && ring.length >= 2) {
    for (const opening of level.openings) {
      if (opening.type !== 'garage-door') continue
      const placed = placedOpening(level, opening.wallId, opening.offset, centroid)
      if (!placed) continue
      drives.push(shootToRing(terrain, ring, placed.point, placed.out, 0.5))
    }
  }
  paintYard(
    terrain,
    (world) => onPatio(rooms, centroid, back, world) || onPoolDeck(terrain, world),
    (world) => (level && fronts.length > 0 ? onFlowerbed(level, fronts, rooms, path, world) : false),
  )
  for (const drive of drives) paintPath(terrain, drive, 3, 'paving')
  // After the bed and patio, so the front path stays gravel where they meet.
  if (path) paintPath(terrain, path, 1.4, 'gravel')
  const plants: Terrain['plants'] = []
  if (ring.length >= 2) {
    const closed = ring.length >= 3
    const spans = closed ? ring.length : ring.length - 1
    let hedge = 0
    for (let i = 0; i < spans; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      if (!a || !b) continue
      const span = dist(a, b)
      const rotation = Math.atan2(b.y - a.y, b.x - a.x)
      const steps = Math.max(1, Math.floor(span / 1.45))
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps
        plants.push({
          id: `hedge_${numericSeed}_${hedge++}`,
          species: 'hedge-segment',
          position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          scale: 1,
          rotation,
        })
      }
    }
  }
  if (level) plants.push(...flowerbedPlants(level, fronts, rooms, path, numericSeed))
  const area = Math.abs(polygonArea(ring))
  const treeCount = clamp(Math.round(area / 90), 3, 12)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const species = ['oak', 'birch', 'pine', 'olive', 'fruit-tree', 'cypress']
  const laid = decodeSplat(terrain.splat, splatLength(terrain))
  const hard = new Set([layerIndex('paving'), layerIndex('soil')])
  const trees = scatterFiltered(minX + 2, minY + 2, maxX - 2, maxY - 2, treeCount, 4.5, numericSeed ^ 0x9e3779b9, (point) => {
    if (ring.length >= 3 && !pointInPolygon(point, ring)) return false
    if (level && nearStructure(level, point, 2.4)) return false
    for (const room of rooms) if (pointInPolygon(point, room.polygon)) return false
    const g = worldToGrid(terrain, point.x, point.y)
    const ix = clamp(Math.round(g.x), 0, terrain.resolution)
    const iy = clamp(Math.round(g.y), 0, terrain.resolution)
    if (hard.has(dominantLayer(laid, gridIndex(ix, iy, terrain.resolution)))) return false
    return true
  })
  const rng = mulberry32(numericSeed ^ 0x51f1e)
  trees.forEach((position, i) => {
    plants.push({
      id: `tree_${numericSeed}_${i}`,
      species: species[Math.floor(rng() * species.length)] ?? 'oak',
      position,
      scale: 0.85 + rng() * 0.4,
      rotation: rng() * Math.PI * 2,
    })
  })
  terrain.plants = plants
}
