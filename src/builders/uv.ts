import * as THREE from 'three'

/**
 * Library materials repeat every `tileSize` metres of UV, so every textured surface needs UVs in
 * metres along that surface. three's primitives emit 0..1 per face instead; `metricUVs` rescales
 * them from the geometry's own parameters.
 */

type Axis = 'x' | 'y' | 'z'
type Scale3 = readonly [number, number, number]

/**
 * A run of vertices whose u and v measure distance along the listed local axes. Several axes mean
 * the direction curves through them (round a cylinder, down a sphere), so a non-uniform mesh
 * scale stretches it by their mean.
 */
interface UvRun {
  start: number
  count: number
  u: readonly Axis[]
  v: readonly Axis[]
}

interface UvTag {
  runs: UvRun[]
  stretch: Scale3
}

const TAG = 'metricUv'
const UNIT: Scale3 = [1, 1, 1]
const AXIS: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }
const AROUND_Y: readonly Axis[] = ['x', 'z']
// A meridian runs half its length near the axis and half across it.
const MERIDIAN: readonly Axis[] = ['y', 'y', 'x', 'z']
const ALL: readonly Axis[] = ['x', 'y', 'z']

function mean(s: Scale3, axes: readonly Axis[]): number {
  let sum = 0
  for (const a of axes) sum += s[AXIS[a]]
  return axes.length ? sum / axes.length : 1
}

function param(geo: THREE.BufferGeometry, key: string, fallback: number): number {
  const value = (geo as unknown as { parameters?: Record<string, unknown> }).parameters?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function scaleRun(uv: THREE.BufferAttribute, start: number, count: number, su: number, sv: number): void {
  const end = Math.min(uv.count, start + count)
  for (let i = start; i < end; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
}

function boxRuns(geo: THREE.BufferGeometry, uv: THREE.BufferAttribute, s: Scale3): UvRun[] {
  const w = param(geo, 'width', 1)
  const h = param(geo, 'height', 1)
  const d = param(geo, 'depth', 1)
  const rounded = geo.type === 'RoundedBoxGeometry' && param(geo, 'segments', 0) >= 1
  const r = rounded ? param(geo, 'radius', 0) : 0
  // RoundedBoxGeometry spreads each face's 0..1 over its flat middle plus a half arc at each edge.
  const span = (length: number) => (r > 0 ? (Math.PI * r) / 2 + Math.max(length - 2 * r, 0) : length)
  const ws = param(geo, 'widthSegments', 1)
  const hs = param(geo, 'heightSegments', 1)
  const ds = param(geo, 'depthSegments', 1)
  // Face order is BoxGeometry's: ±x, ±y, ±z. RoundedBoxGeometry is non-indexed with equal faces.
  const faces: { u: Axis; v: Axis; du: number; dv: number; verts: number }[] = [
    { u: 'z', v: 'y', du: d, dv: h, verts: (ds + 1) * (hs + 1) },
    { u: 'z', v: 'y', du: d, dv: h, verts: (ds + 1) * (hs + 1) },
    { u: 'x', v: 'z', du: w, dv: d, verts: (ws + 1) * (ds + 1) },
    { u: 'x', v: 'z', du: w, dv: d, verts: (ws + 1) * (ds + 1) },
    { u: 'x', v: 'y', du: w, dv: h, verts: (ws + 1) * (hs + 1) },
    { u: 'x', v: 'y', du: w, dv: h, verts: (ws + 1) * (hs + 1) },
  ]
  const runs: UvRun[] = []
  let start = 0
  for (const face of faces) {
    const count = geo.type === 'RoundedBoxGeometry' ? uv.count / 6 : face.verts
    const u = [face.u]
    const v = [face.v]
    scaleRun(uv, start, count, span(face.du) * mean(s, u), span(face.dv) * mean(s, v))
    runs.push({ start, count, u, v })
    start += count
  }
  return runs
}

function cylinderRuns(geo: THREE.BufferGeometry, uv: THREE.BufferAttribute, s: Scale3): UvRun[] {
  const cone = geo.type === 'ConeGeometry'
  const rt = cone ? 0 : param(geo, 'radiusTop', 1)
  const rb = cone ? param(geo, 'radius', 1) : param(geo, 'radiusBottom', 1)
  const h = param(geo, 'height', 1)
  const rs = param(geo, 'radialSegments', 32)
  const hs = param(geo, 'heightSegments', 1)
  const theta = param(geo, 'thetaLength', Math.PI * 2)
  const open = (geo as unknown as { parameters?: { openEnded?: boolean } }).parameters?.openEnded === true
  const round = mean(s, AROUND_Y)
  const slant = Math.hypot(h, rb - rt) * s[1]
  // Side rows run top to bottom. u is the arc at each row's own radius, so a taper stays metric.
  for (let y = 0; y <= hs; y++) {
    const radius = rt + ((rb - rt) * y) / hs
    for (let x = 0; x <= rs; x++) {
      const i = y * (rs + 1) + x
      if (i < uv.count) uv.setXY(i, (x / rs) * theta * radius * round, (1 - y / hs) * slant)
    }
  }
  const side = (hs + 1) * (rs + 1)
  const runs: UvRun[] = [{ start: 0, count: side, u: AROUND_Y, v: ['y'] }]
  let start = side
  // Each cap is a centre per segment plus a closed rim; its 0..1 spans the diameter in x and z.
  for (const radius of open ? [] : [rt, rb]) {
    if (radius <= 0) continue
    const count = rs + rs + 1
    scaleRun(uv, start, count, 2 * radius * s[0], 2 * radius * s[2])
    runs.push({ start, count, u: ['x'], v: ['z'] })
    start += count
  }
  return runs
}

function latheRuns(geo: THREE.BufferGeometry, uv: THREE.BufferAttribute, s: Scale3): UvRun[] {
  const points = (geo as unknown as { parameters?: { points?: readonly THREE.Vector2[] } }).parameters?.points ?? []
  const segments = param(geo, 'segments', 12)
  const phi = param(geo, 'phiLength', Math.PI * 2)
  const n = points.length
  const radial = mean(s, AROUND_Y)
  // v is the distance down the profile, u the arc at each profile point's radius.
  const along: number[] = []
  let total = 0
  for (let j = 0; j < n; j++) {
    const p = points[j]
    const q = points[j - 1]
    if (p && q) total += Math.hypot((p.x - q.x) * radial, (p.y - q.y) * s[1])
    along.push(total)
  }
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < n; j++) {
      const k = i * n + j
      const r = points[j]?.x ?? 0
      if (k < uv.count) uv.setXY(k, (i / segments) * phi * r * radial, along[j] ?? 0)
    }
  }
  return [{ start: 0, count: uv.count, u: AROUND_Y, v: ALL }]
}

function layout(geo: THREE.BufferGeometry, uv: THREE.BufferAttribute, s: Scale3): UvRun[] | null {
  const all = (su: number, sv: number, u: readonly Axis[], v: readonly Axis[]): UvRun[] => {
    scaleRun(uv, 0, uv.count, su * mean(s, u), sv * mean(s, v))
    return [{ start: 0, count: uv.count, u, v }]
  }
  switch (geo.type) {
    case 'BoxGeometry':
    case 'RoundedBoxGeometry':
      return boxRuns(geo, uv, s)
    case 'CylinderGeometry':
    case 'ConeGeometry':
      return cylinderRuns(geo, uv, s)
    case 'LatheGeometry':
      return latheRuns(geo, uv, s)
    case 'SphereGeometry': {
      // u measured round the equator.
      const r = param(geo, 'radius', 1)
      return all(param(geo, 'phiLength', Math.PI * 2) * r, param(geo, 'thetaLength', Math.PI) * r, AROUND_Y, MERIDIAN)
    }
    case 'TorusGeometry':
      // u along the ring (in the xy plane before any rotation), v round the tube.
      return all(param(geo, 'arc', Math.PI * 2) * param(geo, 'radius', 1), Math.PI * 2 * param(geo, 'tube', 0.4), ['x', 'y'], ALL)
    case 'CircleGeometry': {
      const d = 2 * param(geo, 'radius', 1)
      return all(d, d, ['x'], ['y'])
    }
    case 'PlaneGeometry':
      return all(param(geo, 'width', 1), param(geo, 'height', 1), ['x'], ['y'])
    default:
      return null
  }
}

/**
 * Rewrites a fresh three primitive's UVs into metres. Call it before transforming the geometry.
 * `stretch` is a mesh scale that will be applied on top, so the UVs measure the scaled surface.
 * Unknown geometry types are left alone. Returns the geometry for inline use.
 */
export function metricUVs<T extends THREE.BufferGeometry>(geo: T, stretch: Scale3 = UNIT): T {
  const uv = geo.getAttribute('uv')
  if (!(uv instanceof THREE.BufferAttribute) || geo.userData[TAG]) return geo
  const runs = layout(geo, uv, stretch)
  if (!runs) return geo
  const tag: UvTag = { runs, stretch: [...stretch] }
  geo.userData[TAG] = tag
  uv.needsUpdate = true
  return geo
}

/** After a quarter-turn baked into the geometry (rotateX/Y/Z by ±90°), axes `a` and `b` trade places. */
export function swapUvAxes(geo: THREE.BufferGeometry, a: Axis, b: Axis): void {
  const tag = geo.userData[TAG] as UvTag | undefined
  if (!tag) return
  const swap = (axes: readonly Axis[]) => axes.map((x) => (x === a ? b : x === b ? a : x))
  for (const run of tag.runs) {
    run.u = swap(run.u)
    run.v = swap(run.v)
  }
}

/**
 * Catalog parts often scale a unit primitive per mesh (a 0.5 m radius disc stretched to the table
 * size). Re-fits metric UVs on every tagged mesh under `root` to the scale it actually ends up with.
 * Rotations between meshes and the root are ignored; scale is taken per local axis.
 */
export function fitUVsToScale(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry as THREE.BufferGeometry
    const tag = geo.userData[TAG] as UvTag | undefined
    const uv = geo.getAttribute('uv')
    if (!tag || !(uv instanceof THREE.BufferAttribute)) return
    const s: [number, number, number] = [1, 1, 1]
    for (let o: THREE.Object3D | null = node; o; o = o.parent) {
      s[0] *= Math.abs(o.scale.x)
      s[1] *= Math.abs(o.scale.y)
      s[2] *= Math.abs(o.scale.z)
      if (o === root) break
    }
    const was = tag.stretch
    if (Math.abs(s[0] - was[0]) < 1e-9 && Math.abs(s[1] - was[1]) < 1e-9 && Math.abs(s[2] - was[2]) < 1e-9) return
    if (s.some((k) => k < 1e-9)) return
    for (const run of tag.runs) {
      scaleRun(uv, run.start, run.count, mean(s, run.u) / mean(was, run.u), mean(s, run.v) / mean(was, run.v))
    }
    tag.stretch = s
    uv.needsUpdate = true
  })
}
