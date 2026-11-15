import { pointInPolygon, signedDistanceToPolygon } from '../../model/geometry'
import { decodeSplat, sampleHeight, splatLength, worldToGrid } from '../../model/terrain'
import { detectRooms } from '../../model/rooms'
import type { Project, Vec2 } from '../../model/types'
import { GROUND_LAYERS } from '../../model/types'

/**
 * Where grass blades may grow, rasterised once per project change: lawn and meadow weight
 * from the ground splat, minus the house (ground-floor rooms and walls), low slabs, items
 * standing on the ground, and water. Paths, paving, gravel and sand have no grass weight,
 * so blades never come up through them.
 */
export interface GrassMask {
  /** World-space bounds of the raster. */
  minX: number
  minZ: number
  cell: number
  cols: number
  rows: number
  /** Lawn coverage 0..255 and meadow share 0..255 per cell. */
  cover: Uint8Array
  meadow: Uint8Array
  /** Ground height per cell (metres). */
  height: Float32Array
  /** 1 inside a ground-floor room. */
  indoor: Uint8Array
}

const LAWN = GROUND_LAYERS.indexOf('lawn')
const MEADOW = GROUND_LAYERS.indexOf('meadow')

interface Rect {
  cx: number
  cz: number
  cos: number
  sin: number
  hw: number
  hd: number
}

function inRect(r: Rect, x: number, z: number): boolean {
  const dx = x - r.cx
  const dz = z - r.cz
  const u = dx * r.cos + dz * r.sin
  const v = -dx * r.sin + dz * r.cos
  return Math.abs(u) <= r.hw && Math.abs(v) <= r.hd
}

function bounds(points: readonly Vec2[], pad: number): [number, number, number, number] {
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
  return [minX - pad, minY - pad, maxX + pad, maxY + pad]
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

/** Inside the polygon or within `pad` of its outline. */
function near(p: Vec2, polygon: readonly Vec2[], pad: number): boolean {
  return pointInPolygon(p, polygon) || Math.abs(signedDistanceToPolygon(p, polygon)) < pad
}

/** `cell` metres per raster cell. Returns null where no grass can grow at all (apartments). */
export function buildGrassMask(project: Project, mode: 'meadow' | 'asphalt', cell = 0.25): GrassMask | null {
  const terrain = project.terrain
  if (!terrain || mode !== 'meadow') return null
  const enabled = terrain.enabled !== false && terrain.resolution >= 1
  const plotW = Math.max(terrain.width || 0, 16)
  const plotD = Math.max(terrain.depth || 0, 16)
  // Without terrain the lawn is a flat plane well past the plot; grass follows the camera there.
  const halfW = enabled ? plotW / 2 : plotW / 2 + 20
  const halfD = enabled ? plotD / 2 : plotD / 2 + 20
  const cols = Math.max(1, Math.ceil((halfW * 2) / cell))
  const rows = Math.max(1, Math.ceil((halfD * 2) / cell))
  const cover = new Uint8Array(cols * rows)
  const meadow = new Uint8Array(cols * rows)
  const height = new Float32Array(cols * rows)
  const indoor = new Uint8Array(cols * rows)
  const weights = enabled ? decodeSplat(terrain.splat, splatLength(terrain)) : null
  const n = terrain.resolution
  const layers = GROUND_LAYERS.length

  let ground = project.levels[0] ?? null
  for (const level of project.levels) if (!ground || level.elevation < ground.elevation) ground = level
  const rooms = ground ? detectRooms(ground).map((room) => room.polygon) : []
  const walls = ground ? ground.walls : []
  const slabs: Vec2[][] = []
  const rects: Rect[] = []
  for (const level of project.levels) {
    if (level.elevation > 1.2) continue
    for (const slab of level.slabs) if (slab.polygon.length >= 3) slabs.push(slab.polygon)
    if (level !== ground) continue
    for (const item of level.items) {
      if (!Number.isFinite(item.position?.x) || item.elevation > 0.6) continue
      const r = Number.isFinite(item.rotation) ? item.rotation : 0
      rects.push({
        cx: item.position.x,
        cz: item.position.y,
        cos: Math.cos(r),
        sin: Math.sin(r),
        hw: Math.max(0.05, item.size.w / 2 + 0.04),
        hd: Math.max(0.05, item.size.d / 2 + 0.04),
      })
    }
  }
  const water = terrain.water.filter((w) => w.polygon.length >= 3).map((w) => w.polygon)
  const wallBox = walls.length ? bounds(walls.flatMap((w) => [w.a, w.b]), 0.4) : null

  const p = { x: 0, y: 0 }
  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const i = iz * cols + ix
      p.x = -halfW + (ix + 0.5) * cell
      p.y = -halfD + (iz + 0.5) * cell
      let lawn = 1
      let mead = 0
      if (weights) {
        // Bilinear lawn + meadow weight from the splat grid.
        const g = worldToGrid(terrain, p.x, p.y)
        const gx = Math.max(0, Math.min(n, g.x))
        const gy = Math.max(0, Math.min(n, g.y))
        const x0 = Math.min(n - 1, Math.floor(gx))
        const y0 = Math.min(n - 1, Math.floor(gy))
        const tx = gx - x0
        const ty = gy - y0
        let l = 0
        let m = 0
        const corners: [number, number, number][] = [
          [x0, y0, (1 - tx) * (1 - ty)],
          [x0 + 1, y0, tx * (1 - ty)],
          [x0, y0 + 1, (1 - tx) * ty],
          [x0 + 1, y0 + 1, tx * ty],
        ]
        for (const [cx, cy, w] of corners) {
          const base = (cy * (n + 1) + cx) * layers
          l += ((weights[base + LAWN] ?? 0) / 255) * w
          m += ((weights[base + MEADOW] ?? 0) / 255) * w
        }
        lawn = l + m
        mead = l + m > 1e-3 ? m / (l + m) : 0
        height[i] = sampleHeight(terrain, p.x, p.y)
      } else {
        height[i] = -0.02
      }
      if (lawn < 0.35) continue
      let blocked = false
      if (wallBox && p.x > wallBox[0] && p.x < wallBox[2] && p.y > wallBox[1] && p.y < wallBox[3]) {
        for (const room of rooms) {
          if (near(p, room, 0.3)) {
            blocked = true
            if (pointInPolygon(p, room)) indoor[i] = 1
            break
          }
        }
        if (!blocked) {
          for (const wall of walls) {
            if (distToSegment(p, wall.a, wall.b) < (wall.thickness ?? 0.2) / 2 + 0.12) {
              blocked = true
              break
            }
          }
        }
      }
      if (!blocked) blocked = slabs.some((slab) => near(p, slab, 0.06))
      if (!blocked) blocked = water.some((pond) => near(p, pond, 0.35))
      if (!blocked) blocked = rects.some((rect) => inRect(rect, p.x, p.y))
      if (blocked) continue
      cover[i] = Math.round(Math.min(1, (lawn - 0.35) / 0.4) * 255)
      meadow[i] = Math.round(mead * 255)
    }
  }
  return { minX: -halfW, minZ: -halfD, cell, cols, rows, cover, meadow, height, indoor }
}

/** True when the point is inside a ground-floor room. */
export function grassIndoorAt(mask: GrassMask, x: number, z: number): boolean {
  const ix = Math.floor((x - mask.minX) / mask.cell)
  const iz = Math.floor((z - mask.minZ) / mask.cell)
  if (ix < 0 || iz < 0 || ix >= mask.cols || iz >= mask.rows) return false
  return mask.indoor[iz * mask.cols + ix] === 1
}

/** Cover 0..1 at a world point (nearest cell); 0 off the raster. */
export function grassCoverAt(mask: GrassMask, x: number, z: number): number {
  const ix = Math.floor((x - mask.minX) / mask.cell)
  const iz = Math.floor((z - mask.minZ) / mask.cell)
  if (ix < 0 || iz < 0 || ix >= mask.cols || iz >= mask.rows) return 0
  return (mask.cover[iz * mask.cols + ix] ?? 0) / 255
}
