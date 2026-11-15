import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import '../../src/catalog'
import { buildColumn } from '../../src/builders/columns'
import { buildItem } from '../../src/builders/items'
import { buildRoof } from '../../src/builders/roofs'
import { buildSlab } from '../../src/builders/slabs'
import { buildStair } from '../../src/builders/stairs'
import { fitUVsToScale, metricUVs } from '../../src/builders/uv'
import { buildWall } from '../../src/builders/walls'
import { getEntry, listEntries } from '../../src/catalog/registry'
import { getMaterial } from '../../src/materials/materialCache'
import { createLevel, createProject, createWall } from '../../src/model/defaults'
import type { Item, Roof, Stair } from '../../src/model/types'
import { createGroundLayer } from '../../src/view3d/layers/ground'
import type { SceneLayerContext } from '../../src/view3d/layers'
import { OutsideFeatures } from '../../src/view3d/terrain/features'

type Tri = { p: THREE.Vector3[]; uv: THREE.Vector2[]; n: THREE.Vector3 }

/** World-space triangles of a mesh with their UVs, so mesh and parent scale count. */
function triangles(mesh: THREE.Mesh): Tri[] {
  mesh.updateWorldMatrix(true, false)
  const geo = mesh.geometry as THREE.BufferGeometry
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!pos || !uv) return []
  const index = geo.getIndex()
  const count = index ? index.count : pos.count
  const at = (k: number) => (index ? index.getX(k) : k)
  const out: Tri[] = []
  for (let k = 0; k + 2 < count; k += 3) {
    const ids = [at(k), at(k + 1), at(k + 2)]
    const p = ids.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
    const t = ids.map((i) => new THREE.Vector2().fromBufferAttribute(uv, i))
    const [a, b, c] = p as [THREE.Vector3, THREE.Vector3, THREE.Vector3]
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
    if (n.lengthSq() < 1e-12) continue
    out.push({ p, uv: t, n: n.normalize() })
  }
  return out
}

/** Flat metric mapping: every triangle edge is as long in UV as in the world. Returns the worst error in metres. */
function worstEdgeError(tris: Tri[]): number {
  let worst = 0
  for (const tri of tris) {
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3
      const world = tri.p[i]!.distanceTo(tri.p[j]!)
      const tex = tri.uv[i]!.distanceTo(tri.uv[j]!)
      worst = Math.max(worst, Math.abs(world - tex))
    }
  }
  return worst
}

function uvSpan(tris: Tri[]): { u: number; v: number } {
  const box = new THREE.Box2()
  for (const tri of tris) for (const t of tri.uv) box.expandByPoint(t)
  return { u: box.max.x - box.min.x, v: box.max.y - box.min.y }
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh && !mesh.userData.envelope) out.push(mesh)
  })
  return out
}

describe('metric uv scale', () => {
  it('a 4 m wall spans 4 m along u and its height along v', () => {
    const level = createLevel('Ground', 0)
    const wall = createWall({ x: 0, y: 0 }, { x: 4, y: 0 })
    level.walls.push(wall)
    const group = buildWall(wall, level, level.walls)
    for (const face of ['left', 'right']) {
      const mesh = meshes(group).find((m) => m.userData.face === face)
      expect(mesh, face).toBeTruthy()
      const tris = triangles(mesh!)
      const span = uvSpan(tris)
      expect(span.u).toBeCloseTo(4, 4)
      expect(span.v).toBeCloseTo(wall.height, 4)
      expect(worstEdgeError(tris)).toBeLessThan(1e-4)
    }
    const ends = meshes(group).find((m) => m.userData.face === 'end')
    expect(worstEdgeError(triangles(ends!))).toBeLessThan(1e-4)
  })

  it('a 5 × 3 m slab spans 5 × 3 in uv and every face is metric', () => {
    const level = createLevel('Ground', 0)
    const slab = {
      id: 's',
      polygon: [
        { x: 1, y: 2 },
        { x: 6, y: 2 },
        { x: 6, y: 5 },
        { x: 1, y: 5 },
      ],
      thickness: 0.2,
      top: 0,
      material: { id: 'concrete' },
    }
    const mesh = meshes(buildSlab(slab, level))[0]!
    const tris = triangles(mesh)
    const top = tris.filter((t) => t.n.y > 0.9)
    expect(uvSpan(top).u).toBeCloseTo(5, 4)
    expect(uvSpan(top).v).toBeCloseTo(3, 4)
    expect(worstEdgeError(tris)).toBeLessThan(1e-4)
  })

  it('a pitched roof plane is metric along the slope', () => {
    const level = createLevel('Ground', 0)
    const roof: Roof = {
      id: 'r',
      shape: 'gable',
      outline: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 0, y: 4 },
      ],
      pitch: Math.PI / 5,
      overhang: 0.3,
      ridgeAngle: 0,
      thickness: 0.08,
      material: { id: 'roof-tiles' },
      cutouts: [],
    }
    const built = meshes(buildRoof(roof, level))
    const all = built.map(triangles)
    // Fascia, gable ends and trim (ridge caps, gutters, downpipes) included.
    for (const tris of all) expect(worstEdgeError(tris)).toBeLessThan(1e-4)
    // Upper side of each sloped face, grouped by its normal. Trim pieces are separate charts.
    const byNormal = new Map<string, Tri[]>()
    for (const t of built.filter((m) => !m.userData.trim).flatMap(triangles)) {
      if (t.n.y < 0.3 || t.n.y > 0.99) continue
      const key = `${t.n.x.toFixed(2)},${t.n.y.toFixed(2)},${t.n.z.toFixed(2)}`
      byNormal.set(key, [...(byNormal.get(key) ?? []), t])
    }
    const planes = [...byNormal.values()]
    expect(planes.length).toBeGreaterThan(0)
    for (const tris of planes) {
      // Down the slope the world distance is run / cos(pitch); an isometric map keeps it in uv.
      expect(worstEdgeError(tris)).toBeLessThan(1e-4)
      let worldMax = 0
      let uvMax = 0
      const pts = tris.flatMap((t) => t.p.map((p, i) => ({ p, uv: t.uv[i]! })))
      for (const a of pts) {
        for (const b of pts) {
          worldMax = Math.max(worldMax, a.p.distanceTo(b.p))
          uvMax = Math.max(uvMax, a.uv.distanceTo(b.uv))
        }
      }
      expect(uvMax).toBeCloseTo(worldMax, 4)
    }
  })

  it('box primitives span their face dimensions, rounded boxes their arc length', () => {
    const box = metricUVs(new THREE.BoxGeometry(2, 3, 4))
    const tris = triangles(new THREE.Mesh(box))
    expect(worstEdgeError(tris)).toBeLessThan(1e-6)
    const front = tris.filter((t) => t.n.z > 0.9)
    expect(uvSpan(front)).toEqual({ u: expect.closeTo(2, 6), v: expect.closeTo(3, 6) })
    const r = 0.05
    const rounded = metricUVs(new RoundedBoxGeometry(0.6, 0.9, 0.04, 2, 0.01))
    const span = uvSpan(triangles(new THREE.Mesh(rounded)).filter((t) => t.n.z > 0.99))
    expect(span.u).toBeLessThanOrEqual(0.6)
    expect(span.u).toBeGreaterThan(0.55)
    const big = metricUVs(new RoundedBoxGeometry(1, 1, 1, 2, r))
    const uv = big.getAttribute('uv')
    let maxU = 0
    for (let i = 0; i < uv.count / 6; i++) maxU = Math.max(maxU, uv.getX(i))
    // One face: flat middle plus a 45° arc at each edge.
    expect(maxU).toBeCloseTo(1 - 2 * r + (Math.PI * r) / 2, 6)
  })

  it('cylinders measure circumference by height, and caps their diameter', () => {
    const geo = metricUVs(new THREE.CylinderGeometry(0.15, 0.15, 2.7, 16))
    const tris = triangles(new THREE.Mesh(geo))
    const side = tris.filter((t) => Math.abs(t.n.y) < 0.1)
    expect(uvSpan(side).u).toBeCloseTo(2 * Math.PI * 0.15, 6)
    expect(uvSpan(side).v).toBeCloseTo(2.7, 6)
    const cap = tris.filter((t) => t.n.y > 0.9)
    expect(uvSpan(cap).u).toBeCloseTo(0.3, 6)
    expect(worstEdgeError(cap)).toBeLessThan(1e-6)
  })

  it('a column spans its own size', () => {
    const level = createLevel('Ground', 0)
    const square = meshes(buildColumn({ id: 'c', position: { x: 1, y: 1 }, size: 0.3, round: false, material: { id: 'concrete' } }, level))[0]!
    const tris = triangles(square)
    expect(worstEdgeError(tris)).toBeLessThan(1e-5)
    expect(uvSpan(tris.filter((t) => t.n.x > 0.9)).v).toBeCloseTo(level.height, 5)
    const round = meshes(buildColumn({ id: 'c', position: { x: 1, y: 1 }, size: 0.3, round: true, material: { id: 'concrete' } }, level))[0]!
    expect(uvSpan(triangles(round).filter((t) => Math.abs(t.n.y) < 0.1)).u).toBeCloseTo(Math.PI * 0.3, 5)
  })

  it('stair posts and rails are metric', () => {
    const level = createLevel('Ground', 0)
    const stair: Stair = {
      id: 'st',
      shape: 'straight',
      position: { x: 2, y: 2 },
      rotation: 0,
      width: 0.9,
      rise: 2.7,
      turnLeft: true,
      material: { id: 'oak-planks' },
      railing: true,
    }
    for (const mesh of meshes(buildStair(stair, level))) {
      if (mesh.geometry.type !== 'BoxGeometry') continue
      expect(worstEdgeError(triangles(mesh))).toBeLessThan(1e-4)
    }
  })

  it('every flat box in the catalog is metric at its final scale', () => {
    const bad: string[] = []
    for (const entry of listEntries()) {
      const materials: Record<string, THREE.MeshStandardMaterial> = {}
      for (const [slot, ref] of Object.entries(entry.materialSlots)) materials[slot] = getMaterial(ref)
      const root = entry.build({ size: entry.defaultSize, materials, params: {} })
      for (const mesh of meshes(root)) {
        if (mesh.geometry.type !== 'BoxGeometry' || mesh.userData.slot === 'canvas') continue
        const err = worstEdgeError(triangles(mesh))
        if (err > 1e-4) bad.push(`${entry.id}/${mesh.userData.slot ?? '?'}: ${err.toFixed(4)}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('a scaled catalog disc spans the table it was stretched to', () => {
    const item: Item = {
      id: 'it',
      catalogId: 'round-table',
      position: { x: 0, y: 0 },
      elevation: 0,
      rotation: 0,
      size: { w: 1.6, d: 1.0, h: 0.75 },
      materials: {},
    } as Item
    expect(getEntry('round-table')).toBeTruthy()
    const top = meshes(buildItem(item)).find((m) => m.userData.slot === 'top')!
    const cap = triangles(top).filter((t) => t.n.y > 0.9)
    expect(uvSpan(cap).u).toBeCloseTo(1.6, 4)
    expect(uvSpan(cap).v).toBeCloseTo(1.0, 4)
  })

  it('fitting to scale is idempotent', () => {
    const mesh = new THREE.Mesh(metricUVs(new THREE.BoxGeometry(1, 1, 1)))
    mesh.scale.set(2, 3, 4)
    const root = new THREE.Group().add(mesh)
    fitUVsToScale(root)
    fitUVsToScale(root)
    const front = triangles(mesh).filter((t) => t.n.z > 0.9)
    expect(uvSpan(front)).toEqual({ u: expect.closeTo(2, 6), v: expect.closeTo(3, 6) })
  })

  it('the ground plane is in world metres', () => {
    const scene = new THREE.Scene()
    const layer = createGroundLayer({ scene } as unknown as SceneLayerContext)
    const ground = scene.getObjectByName('ground') as THREE.Mesh
    const tris = triangles(ground)
    expect(uvSpan(tris).u).toBeCloseTo(840, 2)
    expect(worstEdgeError(tris)).toBeLessThan(1e-3)
    layer.dispose()
  })

  it('pool walls and boundary posts are metric', () => {
    const project = createProject('Pool', 'house')
    const terrain = project.terrain!
    terrain.water.push({
      id: 'w',
      kind: 'pool',
      polygon: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 3 },
        { x: 0, y: 3 },
      ],
      level: 0,
      depth: 1.4,
    })
    const features = new OutsideFeatures()
    features.sync(project, 'all', project.levels[0]!.id)
    const boxes = meshes(features.group).filter((m) => m.geometry.type === 'BoxGeometry')
    expect(boxes.length).toBeGreaterThan(0)
    for (const mesh of boxes) expect(worstEdgeError(triangles(mesh))).toBeLessThan(1e-4)
    const post = meshes(features.group).find((m) => m.geometry.type === 'CylinderGeometry')!
    // Tapered post: v runs down the slant, 0.7 m high with a 1 cm taper.
    expect(uvSpan(triangles(post).filter((t) => Math.abs(t.n.y) < 0.3)).v).toBeCloseTo(Math.hypot(0.7, 0.01), 5)
  })
})
