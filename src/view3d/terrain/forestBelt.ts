import * as THREE from 'three'
import { srgbByteToLinear } from '../colorLinear'

/**
 * A ring of woodland and fields between the meadow and the far ridge. The ridge alone read as one
 * smooth pale band; real horizons are broken by tree crowns, with open fields between the woods.
 */
export const FOREST_BELT = {
  inner: 425,
  outer: 570,
  /** Angular cells (one crown each) around the inner edge: ~9 m crowns at 425 m. */
  crowns: 300,
  segs: 1440,
  baseY: -1.5,
} as const

function hash(index: number): number {
  const value = Math.sin(index * 91.7 + 47.3) * 43758.5453
  return value - Math.floor(value)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

/** 1 where woodland stands, 0 over open fields. About two thirds of the ring is wooded. */
export function woodland(angle: number): number {
  const n = Math.sin(angle * 5 + 0.7) * 0.55 + Math.sin(angle * 11 + 2.1) * 0.3 + Math.sin(angle * 23 + 4.4) * 0.15
  return smoothstep(-0.32, -0.12, n)
}

/** Canopy height (m) at an angle, for a row `row` 0..1 deep into the belt. */
/** One lattice of crowns: `count` cells around the ring, each a dome (broadleaf) or a cone (conifer). */
function crowns(turn: number, count: number, shift: number, salt: number): { height: number; cell: number } {
  const t = turn * count + shift
  const cell = Math.floor(t)
  const f = t - cell
  const h = hash(cell * 1.37 + salt)
  const x = 2 * f - 1
  const shape = h > 0.74 ? 1 - Math.abs(x) : Math.sqrt(Math.max(0, 1 - x * x))
  return { height: shape * (2 + h * 6), cell }
}

export function canopyHeight(angle: number, row: number): number {
  const turn = ((angle / (Math.PI * 2)) % 1 + 1) % 1
  // Two lattices with unrelated spacing, the taller crown wins: irregular widths and gaps instead
  // of a row of identical scallops. Back rows shift so they fill the front row's gaps.
  const salt = Math.round(row * 7) * 1009
  const a = crowns(turn, FOREST_BELT.crowns, row * 0.5, salt)
  const b = crowns(turn, Math.round(FOREST_BELT.crowns * 0.61), row * 0.31 + 0.4, salt + 503)
  const crown = Math.max(a.height, b.height * 1.15)
  const stand =
    11 + 3.5 * (Math.sin(angle * 3.3 + 1.1) * 0.5 + 0.5) + 2 * (Math.sin(angle * 17.9 + 0.3) * 0.5 + 0.5)
  const wood = stand + crown
  const field = 1.2 + (a.height / 8) * 0.8 * hash(a.cell + 7)
  const w = woodland(angle)
  return w * wood + (1 - w) * field
}

/** Rows across the belt: [depth 0..1, height share]. Steep front edge, rounded back. */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.04, 0.82],
  [0.12, 1],
  [0.45, 1],
  [0.8, 0.92],
  [1, 0],
]

const WOOD_DARK: readonly [number, number, number] = [62, 86, 50]
const WOOD_LIGHT: readonly [number, number, number] = [98, 122, 66]
const FIELD_GREEN: readonly [number, number, number] = [104, 124, 66]
const FIELD_STRAW: readonly [number, number, number] = [146, 138, 86]

export function forestBeltGeometry(): THREE.BufferGeometry {
  const { inner, outer, segs, baseY } = FOREST_BELT
  const positions: number[] = []
  const colors: number[] = []
  for (const [depth, share] of PROFILE) {
    const radius = inner + (outer - inner) * depth
    for (let ix = 0; ix <= segs; ix++) {
      const angle = (ix / segs) * Math.PI * 2
      const height = baseY + share * (canopyHeight(angle, depth) - baseY)
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
      const w = woodland(angle)
      const cell = Math.floor(((angle / (Math.PI * 2)) % 1) * FOREST_BELT.crowns)
      const tint = hash(cell * 3 + 1)
      // Crowns catch more light at the top; field colour changes by parcel.
      const lift = share * 0.35
      const parcel = hash(Math.floor(angle * 9) + 41)
      const field = parcel > 0.55 ? FIELD_STRAW : FIELD_GREEN
      for (let c = 0; c < 3; c++) {
        const wood = WOOD_DARK[c]! + (WOOD_LIGHT[c]! - WOOD_DARK[c]!) * Math.min(1, tint * 0.7 + lift)
        colors.push(srgbByteToLinear(w * wood + (1 - w) * field[c]!))
      }
    }
  }
  const index: number[] = []
  const stride = segs + 1
  for (let iy = 0; iy < PROFILE.length - 1; iy++) {
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
