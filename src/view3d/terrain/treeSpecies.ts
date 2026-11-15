import * as THREE from 'three'
import { mulberry32 } from '../../model/terrain'

/**
 * Species → ez-tree preset, plus the pure geometry passes that turn a generated tree (in
 * ez-tree's arbitrary units) into a game plant: scaled to metres, base at y = 0, a wind
 * attribute, rounder canopy normals and a thinned leaf set for the mid LOD.
 *
 * Nothing here imports ez-tree, so the passes run (and are tested) in Node.
 */

/** Per-instance sway data: [gust phase from the plant's ground position, plant scale]. */
export const PLANT_SWAY_ATTRIBUTE = 'plantSway'

/** Gust phase keyed off the plant's origin, so a whole plant moves together. */
export function swayPhase(x: number, z: number): number {
  return x * 0.37 + z * 0.23
}

export type BarkKind ='oak' | 'birch' | 'pine' | 'willow'
export type LeafKind = 'oak' | 'ash' | 'aspen' | 'pine'

export interface FoliageSpec {
  /** ez-tree preset name, or 'hedge' for the leaf-card volume built here. */
  preset: string
  /** Height in metres at plant scale 1. */
  height: number
  /** Horizontal squash or stretch after the height fit. */
  widthScale: number
  bark: BarkKind
  leaf: LeafKind
  /** Linear multiplier on the leaf texture. */
  leafTint: [number, number, number]
  barkTint: [number, number, number]
  /** One generated variant per seed; a plant picks one from its id. */
  seeds: number[]
  /** Trees get a mid LOD and a far impostor; bushes and hedges stay one mesh. */
  lods: 'tree' | 'bush' | 'single'
  /** Bend at the crown, metres per metre of height, at full gust. */
  flex: number
  /** Leaf cards kept by the mid LOD (area is preserved, so the canopy keeps its mass). */
  midKeep: number
  /** Leaf cards scaled from the preset's size (denser crowns where the texture is sparse). */
  leafSize?: number
  /** Leaves are solid geometry (palm leaflets), not alpha-tested texture cards. */
  solidLeaves?: boolean
}

/** Near-LOD budget for one tree, bark plus leaves. */
export const TREE_TRIANGLE_BUDGET = 15_000

/** Near → mid and mid → impostor, metres from the camera, with hysteresis either side. */
export const LOD_NEAR = 34
export const LOD_FAR = 80
export const LOD_HYSTERESIS = 3

const G: [number, number, number] = [1, 1, 1]

export const FOLIAGE_SPECS: Record<string, FoliageSpec> = {
  oak: {
    preset: 'Oak Medium',
    height: 7.5,
    widthScale: 1,
    bark: 'oak',
    leaf: 'oak',
    leafTint: [0.8, 0.9, 0.7],
    leafSize: 1.3,
    barkTint: [0.82, 0.78, 0.74],
    seeds: [35729, 4211, 90817],
    lods: 'tree',
    flex: 0.022,
    midKeep: 0.42,
  },
  birch: {
    preset: 'Aspen Medium',
    height: 9,
    widthScale: 1.05,
    bark: 'birch',
    leaf: 'ash',
    leafTint: [0.95, 1.02, 0.72],
    leafSize: 1.25,
    barkTint: G,
    seeds: [8812, 517, 23090],
    lods: 'tree',
    flex: 0.03,
    midKeep: 0.45,
  },
  pine: {
    preset: 'Pine Medium',
    height: 8,
    widthScale: 0.95,
    bark: 'pine',
    leaf: 'pine',
    leafTint: [0.72, 0.84, 0.74],
    leafSize: 1.55,
    barkTint: [0.9, 0.86, 0.82],
    seeds: [64091, 1203, 77141],
    lods: 'tree',
    flex: 0.016,
    midKeep: 0.42,
  },
  cypress: {
    preset: 'Pine Small',
    height: 7,
    widthScale: 0.42,
    bark: 'pine',
    leaf: 'pine',
    leafTint: [0.55, 0.72, 0.6],
    leafSize: 1.5,
    barkTint: [0.9, 0.86, 0.82],
    seeds: [2207, 98011, 4410],
    lods: 'tree',
    flex: 0.012,
    midKeep: 0.45,
  },
  olive: {
    preset: 'Ash Small',
    height: 4.6,
    widthScale: 1.15,
    bark: 'willow',
    leaf: 'ash',
    leafTint: [0.92, 0.9, 0.8],
    leafSize: 1.2,
    barkTint: [0.86, 0.84, 0.8],
    seeds: [3141, 2718, 1618],
    lods: 'tree',
    flex: 0.02,
    midKeep: 0.42,
  },
  'fruit-tree': {
    preset: 'Oak Small',
    height: 4.4,
    widthScale: 1.05,
    bark: 'willow',
    leaf: 'oak',
    leafTint: [0.86, 0.98, 0.7],
    leafSize: 1.25,
    barkTint: [0.78, 0.72, 0.68],
    seeds: [1999, 5077, 61003],
    lods: 'tree',
    flex: 0.022,
    midKeep: 0.42,
  },
  palm: {
    preset: 'palm',
    height: 6.5,
    widthScale: 1,
    bark: 'willow',
    leaf: 'ash',
    leafTint: [0.72, 0.86, 0.5],
    barkTint: [0.95, 0.88, 0.78],
    seeds: [77, 4049, 1301],
    lods: 'tree',
    flex: 0.02,
    midKeep: 1,
    solidLeaves: true,
  },
  'bush-round': {
    preset: 'Bush 2',
    height: 1.05,
    widthScale: 1.1,
    bark: 'willow',
    leaf: 'oak',
    leafTint: [0.76, 0.9, 0.68],
    barkTint: [0.7, 0.66, 0.6],
    seeds: [711, 1702],
    lods: 'bush',
    flex: 0.02,
    midKeep: 0.5,
  },
  'bush-flowering': {
    preset: 'Bush 1',
    height: 1,
    widthScale: 1.1,
    bark: 'willow',
    leaf: 'aspen',
    leafTint: [0.5, 0.82, 0.45],
    barkTint: [0.7, 0.66, 0.6],
    seeds: [919, 4243],
    lods: 'bush',
    flex: 0.02,
    midKeep: 0.5,
  },
  'hedge-segment': {
    preset: 'hedge',
    height: 1.12,
    widthScale: 1,
    bark: 'willow',
    leaf: 'oak',
    leafTint: [0.7, 0.86, 0.64],
    barkTint: G,
    seeds: [1, 2],
    lods: 'single',
    flex: 0.012,
    midKeep: 1,
  },
}

export function foliageSpec(species: string): FoliageSpec | null {
  return FOLIAGE_SPECS[species] ?? null
}

/** Stable variant pick from the plant id, so a tree keeps its shape across reloads and syncs. */
export function variantOf(id: string, count: number): number {
  if (count <= 1) return 0
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % count
}

/** LOD 0 near, 1 mid, 2 impostor, with hysteresis around each switch so an orbit never flickers. */
export function lodFor(distance: number, current: number, kind: FoliageSpec['lods']): number {
  if (kind === 'single') return 0
  const far = kind === 'tree' ? LOD_FAR : Infinity
  let level = distance < LOD_NEAR ? 0 : distance < far ? 1 : 2
  if (current >= 0 && level !== current) {
    const edge = level > current ? (current === 0 ? LOD_NEAR : far) : current === 1 ? LOD_NEAR : far
    if (Math.abs(distance - edge) < LOD_HYSTERESIS) level = current
  }
  return level
}

function triangles(geo: THREE.BufferGeometry): number {
  const index = geo.getIndex()
  return (index ? index.count : geo.getAttribute('position').count) / 3
}

export function treeTriangles(bark: THREE.BufferGeometry, leaves: THREE.BufferGeometry): number {
  return triangles(bark) + triangles(leaves)
}

/**
 * Scale bark and leaves together so the tree is `height` tall with its trunk base at the
 * origin. `applyMatrix4` keeps normals right under the anisotropic width squash.
 */
export function fitToHeight(bark: THREE.BufferGeometry, leaves: THREE.BufferGeometry, height: number, widthScale: number): THREE.Matrix4 {
  const box = new THREE.Box3()
  for (const geo of [bark, leaves]) {
    geo.computeBoundingBox()
    if (geo.boundingBox) box.union(geo.boundingBox)
  }
  const tall = box.max.y - Math.min(0, box.min.y)
  const s = tall > 1e-6 ? height / tall : 1
  const m = new THREE.Matrix4().makeScale(s * widthScale, s, s * widthScale)
  for (const geo of [bark, leaves]) applyFit(geo, m)
  return m
}

/** The same fit on another geometry (the mid LOD's bark shares the near skeleton). */
export function applyFit(geo: THREE.BufferGeometry, m: THREE.Matrix4): void {
  geo.applyMatrix4(m)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
}

/**
 * Bend the leaf-card normals towards the canopy's ellipsoid, so the crown shades as a soft
 * volume instead of a confetti of flat cards. The card normal keeps a third of the say.
 */
export function canopyNormals(leaves: THREE.BufferGeometry, keepCard = 0.35): void {
  const pos = leaves.getAttribute('position')
  if (!pos || pos.count === 0) return
  leaves.computeBoundingBox()
  const box = leaves.boundingBox
  if (!box) return
  const c = box.getCenter(new THREE.Vector3())
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  const normal = leaves.getAttribute('normal')
  const out = new Float32Array(pos.count * 3)
  const n = new THREE.Vector3()
  const r = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    r.set(
      (pos.getX(i) - c.x) / Math.max(half.x, 1e-3),
      (pos.getY(i) - c.y) / Math.max(half.y, 1e-3),
      (pos.getZ(i) - c.z) / Math.max(half.z, 1e-3),
    )
    if (r.lengthSq() < 1e-6) r.set(0, 1, 0)
    r.normalize()
    if (normal) {
      n.set(normal.getX(i), normal.getY(i), normal.getZ(i))
      // Cards are two-sided: take whichever face points out of the crown.
      if (n.dot(r) < 0) n.negate()
    } else {
      n.copy(r)
    }
    n.multiplyScalar(keepCard).addScaledVector(r, 1 - keepCard).normalize()
    out[i * 3] = n.x
    out[i * 3 + 1] = n.y
    out[i * 3 + 2] = n.z
  }
  leaves.setAttribute('normal', new THREE.BufferAttribute(out, 3))
}

/** Per-vertex leaf occlusion, 0..1: deep inside the crown is darker than its skin. */
export const LEAF_SHADE_ATTRIBUTE = 'leafShade'

/**
 * Cheap canopy self-shadowing: leaves near the crown's centre get less sky, so they are
 * darker. Without it a dense crown lights evenly and reads milky.
 */
export function leafShade(leaves: THREE.BufferGeometry, floor = 0.42): void {
  const pos = leaves.getAttribute('position')
  if (!pos) return
  leaves.computeBoundingBox()
  const box = leaves.boundingBox
  const out = new Float32Array(pos.count).fill(1)
  if (box && pos.count > 0) {
    const c = box.getCenter(new THREE.Vector3())
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(
        (pos.getX(i) - c.x) / Math.max(half.x, 1e-3),
        (pos.getY(i) - c.y) / Math.max(half.y, 1e-3),
        (pos.getZ(i) - c.z) / Math.max(half.z, 1e-3),
      )
      const t = Math.max(0, Math.min(1, (r - 0.15) / 0.8))
      // Smoothstep, plus a little extra light on top where the sky is.
      const up = (pos.getY(i) - c.y) / Math.max(half.y, 1e-3)
      out[i] = Math.min(1, floor + (1 - floor) * t * t * (3 - 2 * t) + Math.max(0, up) * 0.08)
    }
  }
  leaves.setAttribute(LEAF_SHADE_ATTRIBUTE, new THREE.BufferAttribute(out, 1))
}

/** Per-vertex wind data:[bend in metres at full gust, flutter weight, flutter phase]. */
export const WIND_ATTRIBUTE = 'wind'

/**
 * Bend grows with height squared, so the trunk base stays planted and the crown moves most.
 * Leaves add a flutter with a phase per card (four vertices share it), so a card moves as one.
 */
export function windAttribute(geo: THREE.BufferGeometry, height: number, flex: number, flutter: number, seed = 1): void {
  const pos = geo.getAttribute('position')
  if (!pos) return
  const out = new Float32Array(pos.count * 3)
  const rng = mulberry32(seed)
  let phase = 0
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / Math.max(height, 1e-3)))
    if (i % 4 === 0) phase = rng() * Math.PI * 2
    out[i * 3] = t * t * height * flex
    out[i * 3 + 1] = flutter * t
    out[i * 3 + 2] = flutter > 0 ? phase : 0
  }
  geo.setAttribute(WIND_ATTRIBUTE, new THREE.BufferAttribute(out, 3))
}

/**
 * Keep a fraction of the leaf cards (whole cards: `quadsPerCard` quads of 4 vertices each) and
 * grow the survivors about their base so the canopy covers the same area.
 */
export function thinLeaves(leaves: THREE.BufferGeometry, keep: number, quadsPerCard: number, seed = 7): THREE.BufferGeometry {
  const pos = leaves.getAttribute('position')
  const per = 4 * Math.max(1, quadsPerCard)
  const cards = Math.floor(pos.count / per)
  const k = Math.max(0.05, Math.min(1, keep))
  const grow = Math.sqrt(1 / k)
  const rng = mulberry32(seed)
  const picked: number[] = []
  for (let c = 0; c < cards; c++) if (rng() < k) picked.push(c)
  if (picked.length === 0 && cards > 0) picked.push(0)
  const names = Object.keys(leaves.attributes)
  const outAttrs: Record<string, Float32Array> = {}
  for (const name of names) {
    const attr = leaves.getAttribute(name)
    outAttrs[name] = new Float32Array(picked.length * per * attr.itemSize)
  }
  const base = new THREE.Vector3()
  picked.forEach((card, j) => {
    const v0 = card * per
    // The card's base: ez-tree's quad vertices 1 and 2 sit at the stem end.
    base.set(
      (pos.getX(v0 + 1) + pos.getX(v0 + 2)) / 2,
      (pos.getY(v0 + 1) + pos.getY(v0 + 2)) / 2,
      (pos.getZ(v0 + 1) + pos.getZ(v0 + 2)) / 2,
    )
    for (const name of names) {
      const attr = leaves.getAttribute(name)
      const dst = outAttrs[name]!
      for (let v = 0; v < per; v++) {
        for (let c = 0; c < attr.itemSize; c++) {
          let value = attr.getComponent(v0 + v, c)
          if (name === 'position') {
            const b = c === 0 ? base.x : c === 1 ? base.y : base.z
            value = b + (value - b) * grow
          }
          dst[(j * per + v) * attr.itemSize + c] = value
        }
      }
    }
  })
  const out = new THREE.BufferGeometry()
  for (const name of names) out.setAttribute(name, new THREE.BufferAttribute(outAttrs[name]!, leaves.getAttribute(name).itemSize))
  const index: number[] = []
  for (let q = 0; q < picked.length * quadsPerCard; q++) {
    const i = q * 4
    index.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  out.setIndex(index)
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/**
 * Palm (ez-tree has no palm preset): a ringed, gently leaning trunk and a crown of arching
 * fronds, each a rachis with paired leaflets. Leaflets are 4-vertex cards with their base at
 * vertices 1 and 2, like ez-tree's, so the leaf passes above treat them the same way.
 */
export function palmGeometry(seed: number, height: number): { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const rng = mulberry32(seed * 2654435761 + 7)
  const sections = 16
  const segments = 9
  const leanDir = rng() * Math.PI * 2
  const lean = 0.35 + rng() * 0.5
  const top = height * 0.86
  const spine = (t: number) =>
    new THREE.Vector3(Math.cos(leanDir) * lean * t * t, t * top, Math.sin(leanDir) * lean * t * t)
  const tp: number[] = []
  const tn: number[] = []
  const tu: number[] = []
  const ti: number[] = []
  for (let s = 0; s <= sections; s++) {
    const t = s / sections
    const c = spine(t)
    // Leaf-scar rings: the radius swells a little at every ring.
    const ring = 1 + 0.07 * Math.max(0, Math.sin(t * sections * 3.1))
    const r = (0.2 - 0.07 * t + (t < 0.08 ? (0.08 - t) * 1.4 : 0)) * ring
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2
      const nx = Math.cos(a)
      const nz = Math.sin(a)
      tp.push(c.x + nx * r, c.y, c.z + nz * r)
      tn.push(nx, 0, nz)
      tu.push(j / segments, (t * top) / 0.9)
    }
  }
  for (let s = 0; s < sections; s++) {
    for (let j = 0; j < segments; j++) {
      const a = s * (segments + 1) + j
      const b = a + segments + 1
      ti.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const trunk = new THREE.BufferGeometry()
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3))
  trunk.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3))
  trunk.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2))
  trunk.setIndex(ti)

  const lp: number[] = []
  const ln: number[] = []
  const lu: number[] = []
  const li: number[] = []
  const crown = spine(1)
  const fronds = 12
  const pairs = 24
  for (let f = 0; f < fronds; f++) {
    const az = (f / fronds) * Math.PI * 2 + rng() * 0.4
    const rise = 0.15 + rng() * 0.75
    const length = height * (0.38 + rng() * 0.1)
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az))
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const along = (t: number) => {
      // An arch: out and up, then drooping under its own weight.
      const out = t * length
      const up = (rise * t - (0.55 + rise * 0.6) * t * t) * length * 0.6
      return crown.clone().addScaledVector(dir, out).add(new THREE.Vector3(0, up, 0))
    }
    for (let k = 1; k <= pairs; k++) {
      const t = k / (pairs + 1)
      const p = along(t)
      const ahead = along(Math.min(1, t + 0.04)).sub(p).normalize()
      const size = Math.sin(Math.PI * Math.min(1, t * 1.1)) * length * 0.3 + 0.08
      for (const s of [-1, 1]) {
        // The leaflet points out sideways and forward, drooping a little at its tip.
        const out = side.clone().multiplyScalar(s).addScaledVector(ahead, 0.55).add(new THREE.Vector3(0, -0.35, 0)).normalize()
        const across = ahead.clone().multiplyScalar(0.035 + size * 0.03)
        const tip = p.clone().addScaledVector(out, size)
        const base = lp.length / 3
        const quad = [tip.clone().sub(across), p.clone().sub(across.clone().multiplyScalar(0.4)), p.clone().add(across.clone().multiplyScalar(0.4)), tip.clone().add(across)]
        const n = new THREE.Vector3().crossVectors(out, ahead).normalize()
        if (n.y < 0) n.negate()
        for (const v of quad) {
          lp.push(v.x, v.y, v.z)
          ln.push(n.x, n.y, n.z)
        }
        lu.push(0, 1, 0, 0, 1, 0, 1, 1)
        li.push(base, base + 1, base + 2, base, base + 2, base + 3)
      }
    }
  }
  const leaves = new THREE.BufferGeometry()
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3))
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2))
  leaves.setIndex(li)
  for (const geo of [trunk, leaves]) {
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
  }
  return { trunk, leaves }
}

/**
 * Hedge segment:a clipped box of leaf cards around a dark core, 1.78 m along x like the old
 * segment so neighbours still overlap. Returns the core (bark slot) and the cards (leaf slot).
 */
export function hedgeGeometry(seed: number, height = 1.12): { core: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const rng = mulberry32(seed * 7919 + 13)
  const L = 1.78
  const D = 0.62
  const core = new THREE.BoxGeometry(L * 0.92, height * 0.86, D * 0.72)
  core.translate(0, height * 0.43, 0)
  const pos: number[] = []
  const nrm: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  const cards = 520
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const corner = [
    new THREE.Vector3(-0.5, 0, 0),
    new THREE.Vector3(-0.5, 1, 0),
    new THREE.Vector3(0.5, 1, 0),
    new THREE.Vector3(0.5, 0, 0),
  ]
  const cardUv = [0, 0, 0, 1, 1, 1, 1, 0]
  const p = new THREE.Vector3()
  const out = new THREE.Vector3()
  for (let i = 0; i < cards; i++) {
    // A point on (or just under) the clipped surface: pick a face weighted by area, so the top
    // and both long sides are covered evenly and the short ends get their share.
    const face = rng()
    const u = rng() - 0.5
    const v = rng()
    const depth = 0.04 + rng() * 0.12
    if (face < 0.3) {
      p.set(u * L, height - depth, (rng() - 0.5) * D)
      out.set(0, 1, 0)
    } else if (face < 0.62) {
      p.set(u * L, v * height, D / 2 - depth)
      out.set(0, 0.25, 1)
    } else if (face < 0.94) {
      p.set(u * L, v * height, -D / 2 + depth)
      out.set(0, 0.25, -1)
    } else {
      const side = rng() < 0.5 ? -1 : 1
      p.set(side * (L / 2 - depth), v * height, (rng() - 0.5) * D)
      out.set(side, 0.2, 0)
    }
    out.normalize()
    const size = 0.24 + rng() * 0.16
    // The card leans out of the hedge with its stem inward, then spins about its axis.
    e.set(-Math.PI / 2 + (rng() - 0.5) * 1.6, rng() * Math.PI * 2, (rng() - 0.5) * 1.2)
    q.setFromEuler(e)
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    const base = pos.length / 3
    for (let c = 0; c < 4; c++) {
      const corner3 = corner[c]!.clone().multiplyScalar(size).applyQuaternion(q).add(p)
      corner3.y = Math.max(0.02, Math.min(height + 0.08, corner3.y))
      pos.push(corner3.x, corner3.y, corner3.z)
      const blend = n.clone().multiplyScalar(n.dot(out) < 0 ? -0.3 : 0.3).addScaledVector(out, 0.7).normalize()
      nrm.push(blend.x, blend.y, blend.z)
      uvs.push(cardUv[c * 2]!, cardUv[c * 2 + 1]!)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const leaves = new THREE.BufferGeometry()
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  leaves.setIndex(idx)
  leaves.computeBoundingBox()
  leaves.computeBoundingSphere()
  core.computeBoundingSphere()
  return { core, leaves }
}
