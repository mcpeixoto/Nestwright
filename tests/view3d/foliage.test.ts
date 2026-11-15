import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createProject, createTerrain } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'
import { paintLayer, PLANT_SPECIES } from '../../src/model/terrain'
import type { Vec2 } from '../../src/model/types'
import { castFoliageShadows, leafShadowsFor } from '../../src/view3d/lighting/foliage'
import { qualityProfile } from '../../src/view3d/render/quality'
import { clumpGeometry, GrassField } from '../../src/view3d/terrain/grass'
import { buildGrassMask, grassCoverAt } from '../../src/view3d/terrain/grassMask'
import { TreeField } from '../../src/view3d/terrain/treeField'
import type { SpeciesAssets } from '../../src/view3d/terrain/treeLibrary'
import {
  canopyNormals,
  fitToHeight,
  FOLIAGE_SPECS,
  foliageSpec,
  hedgeGeometry,
  LEAF_SHADE_ATTRIBUTE,
  leafShade,
  LOD_FAR,
  LOD_HYSTERESIS,
  LOD_NEAR,
  lodFor,
  palmGeometry,
  thinLeaves,
  TREE_TRIANGLE_BUDGET,
  variantOf,
  WIND_ATTRIBUTE,
  windAttribute,
} from '../../src/view3d/terrain/treeSpecies'

/** ez-tree's leaf layout: quads of 4 vertices, base at vertices 1 and 2, uv (0,1)(0,0)(1,0)(1,1). */
function cards(count: number, size = 1): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let c = 0; c < count; c++) {
    const x = c * 3
    pos.push(x - size / 2, size + 2, 0, x - size / 2, 2, 0, x + size / 2, 2, 0, x + size / 2, size + 2, 0)
    uv.push(0, 1, 0, 0, 1, 0, 1, 1)
    const i = c * 4
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function cardArea(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position')
  let area = 0
  for (let q = 0; q < pos.count / 4; q++) {
    const w = Math.hypot(pos.getX(q * 4 + 2) - pos.getX(q * 4 + 1), pos.getZ(q * 4 + 2) - pos.getZ(q * 4 + 1))
    const h = pos.getY(q * 4) - pos.getY(q * 4 + 1)
    area += w * h
  }
  return area
}

describe('foliage species', () => {
  it('maps every tree, bush and hedge species to a preset, and nothing else', () => {
    const mapped = PLANT_SPECIES.filter((s) => foliageSpec(s))
    expect(mapped.sort()).toEqual(
      ['oak', 'birch', 'pine', 'cypress', 'palm', 'olive', 'fruit-tree', 'bush-round', 'bush-flowering', 'hedge-segment'].sort(),
    )
    for (const spec of Object.values(FOLIAGE_SPECS)) {
      expect(spec.seeds.length).toBeGreaterThanOrEqual(2)
      expect(spec.height).toBeGreaterThan(0.5)
    }
  })

  it('picks a stable variant from the plant id', () => {
    expect(variantOf('tree_1_3', 3)).toBe(variantOf('tree_1_3', 3))
    const seen = new Set(Array.from({ length: 60 }, (_, i) => variantOf(`p${i}`, 3)))
    expect(seen).toEqual(new Set([0, 1, 2]))
    expect(variantOf('anything', 1)).toBe(0)
  })

  it('switches LOD only past the hysteresis band', () => {
    expect(lodFor(5, -1, 'tree')).toBe(0)
    expect(lodFor(LOD_NEAR + 10, -1, 'tree')).toBe(1)
    expect(lodFor(LOD_FAR + 10, -1, 'tree')).toBe(2)
    // Just past the near edge: a near plant stays near, a fresh one goes mid.
    expect(lodFor(LOD_NEAR + LOD_HYSTERESIS / 2, 0, 'tree')).toBe(0)
    expect(lodFor(LOD_NEAR - LOD_HYSTERESIS / 2, 1, 'tree')).toBe(1)
    expect(lodFor(LOD_NEAR + LOD_HYSTERESIS + 0.1, 0, 'tree')).toBe(1)
    // Bushes never become impostors; hedges are one mesh.
    expect(lodFor(500, -1, 'bush')).toBe(1)
    expect(lodFor(500, -1, 'single')).toBe(0)
  })

  it('fits a tree to its height with the base on the ground', () => {
    const bark = new THREE.CylinderGeometry(1, 2, 40, 6)
    bark.translate(0, 20, 0)
    const leaves = cards(4, 10)
    leaves.translate(0, 35, 0)
    fitToHeight(bark, leaves, 7.5, 1)
    const box = new THREE.Box3().setFromBufferAttribute(bark.getAttribute('position') as THREE.BufferAttribute)
    box.union(new THREE.Box3().setFromBufferAttribute(leaves.getAttribute('position') as THREE.BufferAttribute))
    expect(box.min.y).toBeCloseTo(0, 5)
    expect(box.max.y).toBeCloseTo(7.5, 5)
  })

  it('thins leaf cards for the mid LOD but keeps the canopy area', () => {
    const near = cards(400)
    windAttribute(near, 4, 0.02, 1)
    const mid = thinLeaves(near, 0.4, 1, 3)
    const kept = mid.getAttribute('position').count / 4
    expect(kept).toBeGreaterThan(120)
    expect(kept).toBeLessThan(200)
    expect(cardArea(mid) / cardArea(near)).toBeGreaterThan(0.85)
    expect(cardArea(mid) / cardArea(near)).toBeLessThan(1.15)
    // Extra attributes ride along, so the mid LOD sways like the near one.
    expect(mid.getAttribute(WIND_ATTRIBUTE)?.count).toBe(mid.getAttribute('position').count)
    expect(mid.getIndex()?.count).toBe(kept * 6)
  })

  it('plants the trunk base: no bend at y = 0, most at the crown', () => {
    const geo = new THREE.CylinderGeometry(0.2, 0.3, 6, 6)
    geo.translate(0, 3, 0)
    windAttribute(geo, 6, 0.02, 0)
    const pos = geo.getAttribute('position')
    const wind = geo.getAttribute(WIND_ATTRIBUTE)
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 1e-4) expect(wind.getX(i)).toBe(0)
      if (pos.getY(i) > 5.99) expect(wind.getX(i)).toBeCloseTo(6 * 0.02)
      expect(wind.getY(i)).toBe(0)
    }
  })

  it('turns leaf normals out of the crown and darkens its core', () => {
    // Small cards spread through a ball, like a crown.
    const pos: number[] = []
    let s = 1
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let c = 0; c < 200; c++) {
      const x = rnd() * 3
      const y = rnd() * 3 + 5
      const z = rnd() * 3
      pos.push(x - 0.1, y + 0.2, z, x - 0.1, y, z, x + 0.1, y, z, x + 0.1, y + 0.2, z)
    }
    const leaves = new THREE.BufferGeometry()
    leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    leaves.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3))
    canopyNormals(leaves)
    const normal = leaves.getAttribute('normal')
    const position = leaves.getAttribute('position')
    // A leaf on the crown's +x side faces +x after the pass.
    for (let i = 0; i < position.count; i++) {
      if (position.getX(i) > 2.5) expect(normal.getX(i)).toBeGreaterThan(0.3)
    }
    leafShade(leaves)
    const shade = leaves.getAttribute(LEAF_SHADE_ATTRIBUTE)
    expect(shade.count).toBe(leaves.getAttribute('position').count)
    let min = 1
    let max = 0
    for (let i = 0; i < shade.count; i++) {
      min = Math.min(min, shade.getX(i))
      max = Math.max(max, shade.getX(i))
    }
    expect(min).toBeGreaterThanOrEqual(0.4)
    expect(max).toBeLessThanOrEqual(1)
    expect(max - min).toBeGreaterThan(0.2)
  })

  it('builds hedges as a leaf-card shell around a core, inside its footprint', () => {
    const { core, leaves } = hedgeGeometry(1)
    expect(leaves.getAttribute('position').count / 4).toBeGreaterThan(300)
    leaves.computeBoundingBox()
    const box = leaves.boundingBox!
    expect(box.min.y).toBeGreaterThanOrEqual(0)
    expect(box.max.x - box.min.x).toBeLessThan(2.4)
    expect(box.max.z - box.min.z).toBeLessThan(1.3)
    expect(core.getIndex()?.count).toBe(36)
  })

  it('builds a palm under budget with its crown at the top', () => {
    const { trunk, leaves } = palmGeometry(77, 6.5)
    const tris = (trunk.getIndex()!.count + leaves.getIndex()!.count) / 3
    expect(tris).toBeLessThan(TREE_TRIANGLE_BUDGET)
    trunk.computeBoundingBox()
    expect(trunk.boundingBox!.min.y).toBeCloseTo(0)
    expect(leaves.boundingBox!.max.y).toBeGreaterThan(5)
  })
})

function fakeAssets(): SpeciesAssets {
  const bark = new THREE.CylinderGeometry(0.1, 0.2, 5, 5)
  const leaves = cards(8)
  const variant = {
    seed: 1,
    near: { bark, leaves },
    mid: { bark, leaves: thinLeaves(leaves, 0.5, 1) },
    impostor: null,
    impostorMaterial: null,
    triangles: 0,
  }
  return {
    species: 'oak',
    spec: FOLIAGE_SPECS.oak!,
    bark: new THREE.MeshBasicMaterial(),
    leaves: new THREE.MeshBasicMaterial(),
    variants: [variant],
  }
}

function countsBy(field: TreeField): number[] {
  return field.group.children.map((m) => (m as THREE.InstancedMesh).count)
}

describe('tree field LOD', () => {
  it('draws near trees as meshes and holds mid until an impostor exists', () => {
    const terrain = createTerrain(400, 400, 8)
    const plants = [
      { id: 'a', species: 'oak', position: { x: 0, y: 0 }, scale: 1, rotation: 0 },
      { id: 'b', species: 'oak', position: { x: 60, y: 0 }, scale: 1, rotation: 0 },
      { id: 'c', species: 'oak', position: { x: 150, y: 0 }, scale: 1, rotation: 0 },
    ]
    const asset = fakeAssets()
    const field = new TreeField()
    field.sync(terrain, plants, () => asset)
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 2, 5)
    camera.updateMatrixWorld()
    field.update(camera)
    // [near bark, near leaves, mid bark, mid leaves]: no impostor yet, so the far tree is mid.
    expect(countsBy(field)).toEqual([1, 1, 2, 2])
    const ids = (field.group.children[2] as THREE.Object3D).userData.instanceIds
    expect(ids).toEqual(['b', 'c'])
    const stats = field.stats()
    expect(stats.near).toBeGreaterThan(0)
    expect(stats.mid).toBeGreaterThan(0)
    expect(stats.far).toBe(0)

    // An orbit that grazes the near switch does not flip the tree back and forth.
    camera.position.set(0, 2, LOD_NEAR + LOD_HYSTERESIS / 2)
    camera.updateMatrixWorld()
    field.update(camera)
    expect((field.group.children[0] as THREE.InstancedMesh).count).toBe(1)
    field.dispose()
  })
})

describe('grass placement', () => {
  function ring(points: Vec2[]): Vec2[] {
    return [...points, points[0]!]
  }

  it('grows on lawn, not in the house, on paving or in water', () => {
    const project = createProject('t', 'house')
    project.terrain = createTerrain(40, 30, 32)
    addWallChain(
      project.levels[0]!,
      ring([
        { x: -4, y: -3 },
        { x: 4, y: -3 },
        { x: 4, y: 3 },
        { x: -4, y: 3 },
      ]),
      { thickness: 0.2 },
    )
    paintLayer(project.terrain, 'paving', { x: 12, y: 8 }, 2.5, 1)
    project.terrain.water.push({
      id: 'w',
      kind: 'pool',
      polygon: [
        { x: -15, y: -10 },
        { x: -10, y: -10 },
        { x: -10, y: -6 },
        { x: -15, y: -6 },
      ],
      level: 0,
    })
    const mask = buildGrassMask(project, 'meadow')!
    expect(grassCoverAt(mask, 10, -8)).toBeGreaterThan(0.9)
    expect(grassCoverAt(mask, 0, 0)).toBe(0)
    expect(grassCoverAt(mask, 3.5, 2.5)).toBe(0)
    expect(grassCoverAt(mask, 12, 8)).toBe(0)
    expect(grassCoverAt(mask, -12.5, -8)).toBe(0)
    expect(buildGrassMask(project, 'asphalt')).toBeNull()
  })

  it('places clumps around the camera, inside the radius and never in the house', () => {
    const project = createProject('t', 'house')
    project.terrain = createTerrain(40, 30, 32)
    addWallChain(
      project.levels[0]!,
      ring([
        { x: -4, y: -3 },
        { x: 4, y: -3 },
        { x: 4, y: 3 },
        { x: -4, y: 3 },
      ]),
      { thickness: 0.2 },
    )
    const grass = new GrassField()
    grass.sync(project, 'meadow', { radius: 12, cell: 0.34 })
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(2, 1.6, -6)
    camera.updateMatrixWorld()
    grass.update(camera)
    const { clumps, triangles } = grass.stats()
    expect(clumps).toBeGreaterThan(300)
    expect(triangles).toBe(clumps * 30)
    const a = grass.mesh.geometry.getAttribute('grassA')
    for (let i = 0; i < clumps; i++) {
      const x = a.getX(i)
      const z = a.getZ(i)
      // The clump sits 1 cm into the ground, so allow that much past the radius.
      expect(Math.hypot(x - 2, a.getY(i) - 1.6, z + 6)).toBeLessThanOrEqual(12.02)
      expect(Math.abs(x) < 4 && Math.abs(z) < 3).toBe(false)
    }
    // Off when the tier has no grass.
    grass.sync(project, 'meadow', null)
    grass.update(camera)
    expect(grass.stats().clumps).toBe(0)
    grass.dispose()
  })

  it('is off on Low and denser on High than on Medium', () => {
    expect(qualityProfile('low').grass).toBeNull()
    const medium = qualityProfile('medium').grass!
    const high = qualityProfile('high').grass!
    expect(high.cell).toBeLessThan(medium.cell)
    expect(high.radius).toBeGreaterThanOrEqual(medium.radius)
    expect(medium.radius).toBeGreaterThanOrEqual(20)
    expect(high.radius).toBeLessThanOrEqual(40)
    expect(clumpGeometry().getIndex()!.count / 3).toBe(30)
  })
})

describe('leaf shadows', () => {
  it('casts alpha-tested leaf shadows only from High up; trunks always cast', () => {
    expect(['low', 'medium', 'high', 'ultra'].map((t) => leafShadowsFor(t as never))).toEqual([false, false, true, true])
    const scene = new THREE.Scene()
    const plants = new THREE.Group()
    plants.name = 'plants'
    scene.add(plants)
    const make = (leafCards: boolean) => {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1)
      mesh.userData.kind = 'plant'
      mesh.userData.leafCards = leafCards
      plants.add(mesh)
      return mesh
    }
    const trunk = make(false)
    const leaves = make(true)
    castFoliageShadows(scene, 'medium')
    expect(trunk.castShadow).toBe(true)
    expect(leaves.castShadow).toBe(false)
    castFoliageShadows(scene, 'high')
    expect(leaves.castShadow).toBe(true)
  })
})
