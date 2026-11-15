import * as THREE from 'three'
import {
  bakeAlbedoMaterial,
  bakeNormalMaterial,
  barkMaterial,
  coreMaterial,
  impostorMaterial,
  leafMaterial,
} from './foliageMaterials'
import {
  applyFit,
  canopyNormals,
  fitToHeight,
  foliageSpec,
  hedgeGeometry,
  leafShade,
  palmGeometry,
  thinLeaves,
  TREE_TRIANGLE_BUDGET,
  treeTriangles,
  windAttribute,
  type FoliageSpec,
} from './treeSpecies'

/**
 * Trees, bushes and hedges built from ez-tree (MIT) at load. The library is imported lazily
 * in the browser only: its bundle carries the bark and leaf textures as data URLs and starts
 * decoding them on import. Work is sliced one variant per frame, so loading never stalls a
 * frame for long; plants keep their old low-poly shape until their species is ready.
 */

/** Just the parts of ez-tree this file touches. */
interface EzMesh {
  geometry: THREE.BufferGeometry
  material: THREE.Material & { map?: THREE.Texture | null; normalMap?: THREE.Texture | null; roughnessMap?: THREE.Texture | null }
}
interface EzTree {
  branchesMesh: EzMesh
  leavesMesh: EzMesh
  loadFromJson(json: unknown): void
}
interface EzModule {
  Tree: new () => EzTree
  TreePreset: Record<string, unknown>
}

interface PresetJson {
  seed: number
  bark: { type: string; textureScale: { x: number; y: number } }
  branch: { segments: Record<string, number>; sections: Record<string, number> }
  leaves: { type: string; count: number; billboard: string; size: number }
}

export interface ImpostorAtlas {
  albedo: THREE.RenderTarget
  normals: THREE.RenderTarget
  frames: number
  width: number
  height: number
  base: number
}

export interface FoliageVariant {
  seed: number
  near: { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry }
  mid: { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry } | null
  impostor: ImpostorAtlas | null
  impostorMaterial: THREE.Material | null
  triangles: number
}

export interface SpeciesAssets {
  species: string
  spec: FoliageSpec
  bark: THREE.Material
  leaves: THREE.Material
  variants: FoliageVariant[]
}

const IMPOSTOR_FRAMES = 8
const FRAME_PX = 128

function imageReady(texture: THREE.Texture | null | undefined): boolean {
  const img = texture?.image as { complete?: boolean; naturalWidth?: number; width?: number } | undefined
  if (!img) return false
  if (typeof img.complete === 'boolean') return img.complete && (img.naturalWidth ?? 1) > 0
  return (img.width ?? 0) > 0
}

function cloneMap(source: THREE.Texture | null | undefined, repeat: { x: number; y: number } | null, color: boolean): THREE.Texture | null {
  if (!source) return null
  const map = source.clone()
  map.premultiplyAlpha = false
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  map.anisotropy = 4
  if (repeat) map.repeat.set(repeat.x, 1 / Math.max(1e-3, repeat.y))
  map.needsUpdate = true
  return map
}

function capOptions(json: PresetJson, segmentScale: number): void {
  for (const key of Object.keys(json.branch.segments)) {
    const value = json.branch.segments[key] ?? 3
    const capped = Math.max(3, Math.round(Math.min(value, [7, 5, 4, 3][Number(key)] ?? 3) * segmentScale))
    json.branch.segments[key] = capped
  }
}

export class FoliageLibrary {
  private module: EzModule | null = null
  private loading = false
  private failed = false
  private wanted: string[] = []
  private assets = new Map<string, SpeciesAssets>()
  private pending = new Map<string, { spec: FoliageSpec; done: FoliageVariant[]; textures: SpeciesTextures | null }>()
  /** Bumps whenever a species becomes ready or gains impostors, so fields know to rebuild. */
  version = 0

  /** Ask for a species; it is generated over the next frames. Non-foliage species are ignored. */
  request(species: string): void {
    if (this.assets.has(species) || this.pending.has(species) || this.wanted.includes(species)) return
    if (!foliageSpec(species)) return
    this.wanted.push(species)
  }

  get(species: string): SpeciesAssets | null {
    return this.assets.get(species) ?? null
  }

  /** One slice of work: import, build one variant, or bake one impostor. */
  pump(renderer: THREE.WebGPURenderer | null): void {
    if (this.failed || typeof document === 'undefined') return
    if (!this.module) {
      if (!this.loading && (this.wanted.length > 0 || this.pending.size > 0)) {
        this.loading = true
        import('@dgreenheck/ez-tree')
          .then((mod) => {
            this.module = mod as unknown as EzModule
          })
          .catch((err: unknown) => {
            console.error('ez-tree did not load; plants keep their simple shapes', err)
            this.failed = true
          })
      }
      return
    }
    const next = this.wanted.shift()
    if (next) {
      const spec = foliageSpec(next)
      if (spec) this.pending.set(next, { spec, done: [], textures: null })
    }
    for (const [species, job] of this.pending) {
      if (!job.textures) {
        job.textures = this.textures(job.spec)
        if (!job.textures) return
      }
      if (!job.textures.ready()) return
      const seed = job.spec.seeds[job.done.length]
      if (seed != null) {
        job.done.push(this.build(job.spec, seed))
        if (job.done.length < job.spec.seeds.length) return
      }
      this.pending.delete(species)
      const maps = job.textures.maps()
      this.bakeMaps.set(species, { bark: maps.bark.color, leaf: job.spec.solidLeaves ? null : maps.leaf })
      this.assets.set(species, {
        species,
        spec: job.spec,
        bark: job.spec.preset === 'hedge' ? coreMaterial(job.spec.leafTint) : barkMaterial(maps.bark, job.spec.barkTint),
        leaves: leafMaterial(job.spec.solidLeaves ? null : maps.leaf, job.spec.leafTint),
        variants: job.done,
      })
      this.version++
      return
    }
    if (!renderer) return
    for (const asset of this.assets.values()) {
      if (asset.spec.lods !== 'tree') continue
      const variant = asset.variants.find((v) => !v.impostor)
      if (!variant) continue
      const maps = this.bakeMaps.get(asset.species)
      try {
        variant.impostor = bakeImpostor(renderer, variant, asset.spec, maps ?? { bark: null, leaf: null })
        variant.impostorMaterial = impostorMaterial(variant.impostor.albedo.texture, variant.impostor.normals.texture, variant.impostor.frames, variant.impostor)
      } catch (err) {
        console.error(err)
        asset.spec = { ...asset.spec, lods: 'bush' }
      }
      this.version++
      return
    }
  }

  /** The species' own map clones, reused by the impostor bake. */
  private bakeMaps = new Map<string, { bark: THREE.Texture | null; leaf: THREE.Texture | null }>()

  /** Generate one throwaway tree of the right bark and leaf kinds to reach ez-tree's textures. */
  private textures(spec: FoliageSpec): SpeciesTextures | null {
    const ez = this.module
    if (!ez) return null
    const preset = (ez.TreePreset[spec.preset] ?? ez.TreePreset['Bush 2']) as PresetJson | undefined
    if (!preset) return null
    const json = structuredClone(preset)
    json.bark.type = spec.bark
    json.leaves.type = spec.leaf
    json.leaves.count = 1
    json.branch.sections = { 0: 1, 1: 1, 2: 1, 3: 1 }
    const probe = new ez.Tree()
    probe.loadFromJson(json)
    const bark = probe.branchesMesh.material
    const leaf = probe.leavesMesh.material
    probe.branchesMesh.geometry.dispose()
    probe.leavesMesh.geometry.dispose()
    const scale = json.bark.textureScale ?? { x: 1, y: 1 }
    const sources = { color: bark.map ?? null, normal: bark.normalMap ?? null, roughness: bark.roughnessMap ?? null, leaf: leaf.map ?? null }
    bark.dispose()
    leaf.dispose()
    return {
      ready: () => imageReady(sources.color) && imageReady(sources.leaf),
      maps: () => {
        const out = {
          bark: {
            color: cloneMap(sources.color, scale, true),
            normal: cloneMap(sources.normal, scale, false),
            roughness: cloneMap(sources.roughness, scale, false),
            scale,
          },
          leaf: cloneMap(sources.leaf, null, true),
        }
        if (out.leaf) {
          out.leaf.wrapS = THREE.ClampToEdgeWrapping
          out.leaf.wrapT = THREE.ClampToEdgeWrapping
        }
        return out
      },
    }
  }

  private build(spec: FoliageSpec, seed: number): FoliageVariant {
    if (spec.preset === 'hedge') {
      const { core, leaves } = hedgeGeometry(seed, spec.height)
      leafShade(leaves, 0.55)
      windAttribute(core, spec.height, spec.flex, 0, seed)
      windAttribute(leaves, spec.height, spec.flex, 0.6, seed + 1)
      return { seed, near: { bark: core, leaves }, mid: null, impostor: null, impostorMaterial: null, triangles: treeTriangles(core, leaves) }
    }
    if (spec.preset === 'palm') {
      const { trunk, leaves } = palmGeometry(seed, spec.height)
      leafShade(leaves, 0.7)
      windAttribute(trunk, spec.height, spec.flex, 0, seed)
      windAttribute(leaves, spec.height, spec.flex, 0.7, seed + 1)
      // Few enough triangles that the mid LOD is the near mesh; the impostor still takes over far out.
      return { seed, near: { bark: trunk, leaves }, mid: null, impostor: null, impostorMaterial: null, triangles: treeTriangles(trunk, leaves) }
    }
    const ez = this.module!
    const preset = ez.TreePreset[spec.preset] as PresetJson
    const generate = (segmentScale: number, leafScale: number) => {
      const json = structuredClone(preset)
      json.seed = seed
      json.bark.type = spec.bark
      json.leaves.type = spec.leaf
      json.leaves.count = Math.max(1, Math.round(json.leaves.count * leafScale))
      json.leaves.size *= spec.leafSize ?? 1
      capOptions(json, segmentScale)
      const tree = new ez.Tree()
      tree.loadFromJson(json)
      const bark = tree.branchesMesh.geometry
      const leaves = tree.leavesMesh.geometry
      tree.branchesMesh.material.dispose()
      tree.leavesMesh.material.dispose()
      return { bark, leaves, quads: json.leaves.billboard === 'double' ? 2 : 1 }
    }
    // Over budget: thin the shafts first (a crown reads by its leaves), then drop leaf cards.
    let leafScale = 1
    let segmentScale = 1
    let near = generate(segmentScale, leafScale)
    for (let i = 0; i < 5 && treeTriangles(near.bark, near.leaves) > TREE_TRIANGLE_BUDGET; i++) {
      const over = treeTriangles(near.bark, near.leaves) / TREE_TRIANGLE_BUDGET
      if (segmentScale > 0.6) segmentScale -= 0.25
      else leafScale *= Math.min(0.88, 1 / over)
      near.bark.dispose()
      near.leaves.dispose()
      near = generate(segmentScale, leafScale)
    }
    // Same skeleton (segment count does not touch ez-tree's random stream), thinner shafts.
    const midRaw = spec.lods === 'single' ? null : generate(segmentScale * 0.55, leafScale)
    const fit = fitToHeight(near.bark, near.leaves, spec.height, spec.widthScale)
    canopyNormals(near.leaves)
    leafShade(near.leaves)
    windAttribute(near.bark, spec.height, spec.flex, 0, seed)
    windAttribute(near.leaves, spec.height, spec.flex, 1, seed + 1)
    let mid: FoliageVariant['mid'] = null
    if (midRaw) {
      midRaw.leaves.dispose()
      applyFit(midRaw.bark, fit)
      windAttribute(midRaw.bark, spec.height, spec.flex, 0, seed)
      // Thinned from the near cards, so the crown keeps its outline and its wind phases.
      mid = { bark: midRaw.bark, leaves: thinLeaves(near.leaves, spec.midKeep, near.quads, seed) }
    }
    return { seed, near: { bark: near.bark, leaves: near.leaves }, mid, impostor: null, impostorMaterial: null, triangles: treeTriangles(near.bark, near.leaves) }
  }
}

interface SpeciesTextures {
  ready(): boolean
  maps(): {
    bark: { color: THREE.Texture | null; normal: THREE.Texture | null; roughness: THREE.Texture | null; scale: { x: number; y: number } }
    leaf: THREE.Texture | null
  }
}

/**
 * Render the near mesh from `IMPOSTOR_FRAMES` directions around y into two atlases: flat
 * albedo (alpha = coverage) and object-space normals. Orthographic, base at the frame bottom.
 */
function bakeImpostor(
  renderer: THREE.WebGPURenderer,
  variant: FoliageVariant,
  spec: FoliageSpec,
  maps: { bark: THREE.Texture | null; leaf: THREE.Texture | null },
): ImpostorAtlas {
  const { bark, leaves } = variant.near
  const box = new THREE.Box3()
  bark.computeBoundingBox()
  leaves.computeBoundingBox()
  if (bark.boundingBox) box.union(bark.boundingBox)
  if (leaves.boundingBox) box.union(leaves.boundingBox)
  const reach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z), 0.1) * 1.04
  const base = Math.min(0, box.min.y)
  const height = (box.max.y - base) * 1.02
  const width = reach * 2
  const frameH = Math.max(96, Math.min(256, Math.round((FRAME_PX * height) / width / 16) * 16))
  const make = () => {
    const rt = new THREE.RenderTarget(FRAME_PX * IMPOSTOR_FRAMES, frameH, {
      type: THREE.UnsignedByteType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    })
    rt.texture.name = 'tree-impostor'
    return rt
  }
  const albedo = make()
  const normals = make()
  const scene = new THREE.Scene()
  const barkMesh = new THREE.Mesh(bark)
  const leafMesh = new THREE.Mesh(leaves)
  scene.add(barkMesh, leafMesh)
  const camera = new THREE.OrthographicCamera(-reach, reach, height + base, base, 0.05, reach * 4 + 2)
  const prevTarget = renderer.getRenderTarget()
  const prevAuto = renderer.autoClear
  const prevColor = renderer.getClearColor(new THREE.Color())
  const prevAlpha = renderer.getClearAlpha()
  const passes: [THREE.RenderTarget, THREE.Material, THREE.Material][] = [
    [albedo, bakeAlbedoMaterial(maps.bark, spec.barkTint, false), bakeAlbedoMaterial(maps.leaf, spec.leafTint, true)],
    [normals, bakeNormalMaterial(null, false), bakeNormalMaterial(maps.leaf, true)],
  ]
  try {
    renderer.autoClear = false
    renderer.setClearColor(0x000000, 0)
    for (const [target, barkMat, leafMat] of passes) {
      barkMesh.material = barkMat
      leafMesh.material = leafMat
      renderer.setRenderTarget(target)
      target.viewport.set(0, 0, target.width, target.height)
      renderer.clear()
      for (let k = 0; k < IMPOSTOR_FRAMES; k++) {
        const a = (k / IMPOSTOR_FRAMES) * Math.PI * 2
        camera.position.set(Math.sin(a) * (reach * 2 + 1), 0, Math.cos(a) * (reach * 2 + 1))
        camera.lookAt(0, 0, 0)
        camera.updateMatrixWorld()
        target.viewport.set(k * FRAME_PX, 0, FRAME_PX, frameH)
        renderer.render(scene, camera)
      }
      target.viewport.set(0, 0, target.width, target.height)
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.autoClear = prevAuto
    renderer.setClearColor(prevColor, prevAlpha)
    for (const [, a, b] of passes) {
      a.dispose()
      b.dispose()
    }
  }
  return { albedo, normals, frames: IMPOSTOR_FRAMES, width, height, base }
}

/** One library for the page: trees in the plot and the treeline share variants and atlases. */
export const foliageLibrary = new FoliageLibrary()
