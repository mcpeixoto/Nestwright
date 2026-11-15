import * as THREE from 'three'

/**
 * Geometry kit for architectural trim: skirting, architraves, sills, gutters. Everything is
 * written into one `Sheet` per material and becomes a single mesh, so trim costs a draw call
 * per material, not per piece. Every polygon gets its own flat normal and UVs measured in
 * metres in its own plane, so textured trim keeps the library's real-world scale.
 */

export type V3 = THREE.Vector3

/** One 2D profile point: `a` across the path (away from the piece's base), `b` out of the surface. */
export type ProfilePoint = readonly [number, number]

/** A path vertex: position plus the two profile axes, already mitre-scaled at joints. */
export interface PathFrame {
  p: V3
  s: V3
  o: V3
}

/** A shared planar UV frame, for trim lying parallel to a surface whose UVs it should continue. */
export interface UvBasis {
  origin: V3
  u: V3
  v: V3
}

const scratchN = new THREE.Vector3()
const scratchT = new THREE.Vector3()
const scratchB = new THREE.Vector3()
const scratchD = new THREE.Vector3()

export class Sheet {
  readonly pos: number[] = []
  readonly norm: number[] = []
  readonly uv: number[] = []
  readonly idx: number[] = []
  /** Rigid transform applied to everything added (a door leaf's pivot, say). */
  matrix: THREE.Matrix4 | null = null

  get count(): number {
    return this.pos.length / 3
  }

  get triangles(): number {
    return this.idx.length / 3
  }

  /**
   * A planar polygon in order. Its normal is turned to agree with `hint` when one is given.
   * `u0`/`v0` shift the UVs, so strips along a path keep a continuous u.
   */
  poly(points: readonly V3[], hint?: V3, u0 = 0, v0 = 0, basis?: UvBasis): void {
    const n = points.length
    if (n < 3) return
    const pts = this.matrix ? points.map((p) => p.clone().applyMatrix4(this.matrix!)) : points
    let h = hint
    if (h && this.matrix) h = h.clone().transformDirection(this.matrix)
    const normal = scratchN.set(0, 0, 0)
    for (let i = 0; i < n; i++) {
      const a = pts[i]!
      const b = pts[(i + 1) % n]!
      normal.x += (a.y - b.y) * (a.z + b.z)
      normal.y += (a.z - b.z) * (a.x + b.x)
      normal.z += (a.x - b.x) * (a.y + b.y)
    }
    const area = normal.length()
    if (area < 1e-10) return
    normal.divideScalar(area)
    if (h && normal.dot(h) < 0) normal.negate()
    const origin = basis ? basis.origin : pts[0]!
    const t = scratchT.set(0, 0, 0)
    const b = scratchB.set(0, 0, 0)
    if (basis) {
      t.copy(basis.u)
      b.copy(basis.v)
    } else {
      for (let i = 1; i < n; i++) {
        t.subVectors(pts[i]!, origin)
        t.addScaledVector(normal, -t.dot(normal))
        if (t.lengthSq() > 1e-12) break
      }
      if (t.lengthSq() < 1e-12) return
      t.normalize()
      b.crossVectors(normal, t)
      // Keep v growing across the polygon, away from its first edge.
      let across = 0
      for (const p of pts) across += scratchD.subVectors(p, origin).dot(b)
      if (across < 0) b.negate()
    }
    const base = this.count
    const flat: number[] = []
    for (const p of pts) {
      const d = scratchD.subVectors(p, origin)
      const u = d.dot(t)
      const v = d.dot(b)
      this.pos.push(p.x, p.y, p.z)
      this.norm.push(normal.x, normal.y, normal.z)
      this.uv.push(u0 + u, v0 + v)
      flat.push(u, v)
    }
    let tris: number[]
    if (n <= 4) {
      tris = []
      for (let k = 1; k < n - 1; k++) tris.push(0, k, k + 1)
    } else {
      const contour = []
      for (let k = 0; k < n; k++) contour.push(new THREE.Vector2(flat[k * 2], flat[k * 2 + 1]))
      tris = THREE.ShapeUtils.triangulateShape(contour, []).flat()
    }
    for (let k = 0; k < tris.length; k += 3) {
      const i0 = tris[k]!
      let i1 = tris[k + 1]!
      let i2 = tris[k + 2]!
      // Wind every triangle to face the polygon normal.
      const ax = pts[i1]!.x - pts[i0]!.x
      const ay = pts[i1]!.y - pts[i0]!.y
      const az = pts[i1]!.z - pts[i0]!.z
      const bx = pts[i2]!.x - pts[i0]!.x
      const by = pts[i2]!.y - pts[i0]!.y
      const bz = pts[i2]!.z - pts[i0]!.z
      const cx = ay * bz - az * by
      const cy = az * bx - ax * bz
      const cz = ax * by - ay * bx
      const facing = cx * normal.x + cy * normal.y + cz * normal.z
      if (facing < 0) [i1, i2] = [i2, i1]
      this.idx.push(base + i0, base + i1, base + i2)
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, hint?: V3, u0 = 0, v0 = 0, basis?: UvBasis): void {
    this.poly([a, b, c, d], hint, u0, v0, basis)
  }

  geometry(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    geo.setIndex(this.idx)
    return geo
  }

  /** The sheet as a shadow-casting mesh, or null when nothing was added. */
  mesh(material: THREE.Material): THREE.Mesh | null {
    const geo = this.geometry()
    if (!geo) return null
    const mesh = new THREE.Mesh(geo, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/**
 * Sweeps an open 2D profile along a path. Profile edges run between consecutive points; the
 * profile winds counter-clockwise round the material in (a, b), so an edge's outward normal is
 * (db, −da). `skip` lists edges that lie against something (the wall, the floor). `caps` closes
 * the ends with the whole profile polygon.
 */
export function sweep(
  sheet: Sheet,
  path: readonly PathFrame[],
  profile: readonly ProfilePoint[],
  options: { skip?: readonly number[]; capStart?: boolean; capEnd?: boolean } = {},
): void {
  if (path.length < 2 || profile.length < 2) return
  const skip = new Set(options.skip ?? [])
  const at = (f: PathFrame, q: ProfilePoint) => f.p.clone().addScaledVector(f.s, q[0]).addScaledVector(f.o, q[1])
  const rows = profile.map((q) => path.map((f) => at(f, q)))
  let v0 = 0
  for (let k = 0; k < profile.length - 1; k++) {
    const q0 = profile[k]!
    const q1 = profile[k + 1]!
    const da = q1[0] - q0[0]
    const db = q1[1] - q0[1]
    const width = Math.hypot(da, db)
    if (!skip.has(k) && width > 1e-6) {
      let u = 0
      for (let i = 0; i < path.length - 1; i++) {
        const f0 = path[i]!
        const f1 = path[i + 1]!
        const s = f0.s.clone().add(f1.s).normalize()
        const o = f0.o.clone().add(f1.o).normalize()
        const hint = s.multiplyScalar(db).addScaledVector(o, -da)
        const a0 = rows[k]![i]!
        const a1 = rows[k]![i + 1]!
        sheet.quad(a0, a1, rows[k + 1]![i + 1]!, rows[k + 1]![i]!, hint, u, v0)
        u += a0.distanceTo(a1)
      }
    }
    v0 += width
  }
  const tangent = (i: number, j: number) => path[j]!.p.clone().sub(path[i]!.p)
  if (options.capStart) sheet.poly(rows.map((row) => row[0]!), tangent(1, 0))
  if (options.capEnd) {
    const last = path.length - 1
    sheet.poly(rows.map((row) => row[last]!), tangent(last - 1, last))
  }
}

/** Mitre of two unit directions: the offset that sits one unit from both lines. */
export function mitre(a: V3, b: V3): V3 {
  const sum = a.clone().add(b)
  const k = 1 + a.dot(b)
  if (k < 1e-3) return a.clone()
  return sum.divideScalar(k)
}

/**
 * Box with every edge chamfered by `c` (centred on x, y, z, axis-aligned in the sheet's frame).
 * 44 triangles, against 12 for a sharp box.
 */
export function chamferBox(sheet: Sheet, w: number, h: number, d: number, x: number, y: number, z: number, c = 0.003): void {
  const half = [Math.max(w, 1e-3) / 2, Math.max(h, 1e-3) / 2, Math.max(d, 1e-3) / 2] as const
  const cc = Math.max(0, Math.min(c, half[0] * 0.45, half[1] * 0.45, half[2] * 0.45))
  const centre = v(x, y, z)
  const P = (sx: number, sy: number, sz: number, full: 0 | 1 | 2) => {
    const s = [sx, sy, sz]
    const out = [0, 0, 0]
    for (let k = 0; k < 3; k++) out[k] = s[k]! * (k === full ? half[k]! : half[k]! - cc)
    return v(out[0]!, out[1]!, out[2]!).add(centre)
  }
  const signs = [-1, 1]
  // Faces.
  for (const axis of [0, 1, 2] as const) {
    for (const s of signs) {
      const pts: V3[] = []
      for (const [p, q] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const sg = [0, 0, 0]
        sg[axis] = s
        sg[(axis + 1) % 3] = p
        sg[(axis + 2) % 3] = q
        pts.push(P(sg[0]!, sg[1]!, sg[2]!, axis))
      }
      const hint = v(0, 0, 0)
      hint.setComponent(axis, s)
      sheet.poly(pts, hint)
    }
  }
  if (cc < 1e-5) return
  // Edge chamfers: between the faces of two axes, running along the third.
  for (const [i, j] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const) {
    const k = 3 - i - j
    for (const si of signs) {
      for (const sj of signs) {
        const pts: V3[] = []
        for (const [sk, full] of [
          [-1, i],
          [1, i],
          [1, j],
          [-1, j],
        ] as const) {
          const sg = [0, 0, 0]
          sg[i] = si
          sg[j] = sj
          sg[k] = sk
          pts.push(P(sg[0]!, sg[1]!, sg[2]!, full as 0 | 1 | 2))
        }
        const hint = v(0, 0, 0)
        hint.setComponent(i, si)
        hint.setComponent(j, sj)
        sheet.poly(pts, hint)
      }
    }
  }
  // Corner triangles.
  for (const sx of signs) {
    for (const sy of signs) {
      for (const sz of signs) {
        sheet.poly([P(sx, sy, sz, 0), P(sx, sy, sz, 1), P(sx, sy, sz, 2)], v(sx, sy, sz))
      }
    }
  }
}

/** Straight round-ish bar from `a` to `b`: a `sides`-gon prism, open ends unless `caps`. */
export function prism(sheet: Sheet, a: V3, b: V3, radius: number, sides = 8, caps = false): void {
  const axis = b.clone().sub(a)
  const length = axis.length()
  if (length < 1e-5 || radius < 1e-5) return
  axis.divideScalar(length)
  const ref = Math.abs(axis.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0)
  const e1 = new THREE.Vector3().crossVectors(axis, ref).normalize()
  const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize()
  const ring = (centre: V3) => {
    const out: V3[] = []
    for (let k = 0; k < sides; k++) {
      const t = (k / sides) * Math.PI * 2
      out.push(centre.clone().addScaledVector(e1, Math.cos(t) * radius).addScaledVector(e2, Math.sin(t) * radius))
    }
    return out
  }
  const r0 = ring(a)
  const r1 = ring(b)
  const chord = 2 * radius * Math.sin(Math.PI / sides)
  for (let k = 0; k < sides; k++) {
    const n = (k + 1) % sides
    const mid = r0[k]!.clone().add(r0[n]!).multiplyScalar(0.5).sub(a)
    sheet.quad(r0[k]!, r1[k]!, r1[n]!, r0[n]!, mid, 0, k * chord)
  }
  if (caps) {
    sheet.poly(r0, axis.clone().negate())
    sheet.poly(r1, axis)
  }
}

/**
 * A closed 2D profile (counter-clockwise in its U/V plane) extruded straight along `axis` for
 * `length`, from `origin`. Ends are capped.
 */
export function extrude(sheet: Sheet, profile: readonly ProfilePoint[], origin: V3, U: V3, V: V3, axis: V3, length: number): void {
  const n = profile.length
  if (n < 3 || length < 1e-5) return
  const at = (q: ProfilePoint, s: number) => origin.clone().addScaledVector(U, q[0]).addScaledVector(V, q[1]).addScaledVector(axis, s)
  const start = profile.map((q) => at(q, 0))
  const end = profile.map((q) => at(q, length))
  let v0 = 0
  for (let k = 0; k < n; k++) {
    const q0 = profile[k]!
    const q1 = profile[(k + 1) % n]!
    const da = q1[0] - q0[0]
    const db = q1[1] - q0[1]
    const hint = U.clone().multiplyScalar(db).addScaledVector(V, -da)
    sheet.quad(start[k]!, end[k]!, end[(k + 1) % n]!, start[(k + 1) % n]!, hint, 0, v0)
    v0 += Math.hypot(da, db)
  }
  sheet.poly(start, axis.clone().negate())
  sheet.poly(end, axis)
}

/**
 * A narrow strip leaning 45° over a sharp edge, standing in for a 3–4 mm chamfer: the light
 * catches it as it would a bevel, without re-cutting the faces either side. `edge` runs from
 * `a` to `b`; `n1` and `n2` are the two face normals. `half` draws only the n1 side, for a
 * corner two walls share: each wall draws its own half.
 */
export function edgeStrip(sheet: Sheet, a: V3, b: V3, n1: V3, n2: V3, width = 0.006, half = false): void {
  const normal = n1.clone().add(n2)
  if (normal.lengthSq() < 1e-8) return
  normal.normalize()
  const across = n1.clone().sub(n2)
  if (across.lengthSq() < 1e-8) return
  across.normalize().multiplyScalar(width / 2)
  // Lift the strip a hair off the apex so it never z-fights the faces it covers.
  const lift = normal.clone().multiplyScalar(0.0004)
  const back = half ? new THREE.Vector3() : across.clone().negate()
  const p0 = a.clone().add(across).add(lift)
  const p1 = b.clone().add(across).add(lift)
  const p2 = b.clone().add(back).add(lift)
  const p3 = a.clone().add(back).add(lift)
  sheet.quad(p0, p1, p2, p3, normal)
}

export { v as vec3 }
