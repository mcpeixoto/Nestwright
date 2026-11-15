import { Logger, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, EXTTextureWebP, KHRONOS_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import { cloneDocument, dedup, meshopt, prune, resample, simplify, weld } from '@gltf-transform/functions'
import { Buffer } from 'node:buffer'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { encodeMap } from './textures.mjs'
import { applyBottomCentre } from './place.mjs'
import { modelTextureLimit } from './tile.mjs'

const TRIANGLES = 4

export function countTriangles(document) {
  let count = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue
      const indices = prim.getIndices()
      if (indices) count += indices.getCount() / 3
      else count += (prim.getAttribute('POSITION')?.getCount() ?? 0) / 3
    }
  }
  return count
}

export function materialNames(document) {
  return document.getRoot().listMaterials().map((material) => material.getName() || 'unnamed')
}

function textureRole(document, texture) {
  let normal = false
  let orm = false
  let albedo = false
  for (const material of document.getRoot().listMaterials()) {
    if (material.getNormalTexture() === texture) normal = true
    if (material.getOcclusionTexture() === texture || material.getMetallicRoughnessTexture() === texture) orm = true
    if (material.getBaseColorTexture() === texture) albedo = true
  }
  if (albedo) return 'albedo'
  if (normal) return 'normal'
  if (orm) return 'orm'
  const name = (texture.getName() || '').toLowerCase()
  if (/nor_gl|normal|_nrm/.test(name)) return 'normal'
  if (/_arm\b|_arm[._]|orm|roughness|metalness|occlusion/.test(name)) return 'orm'
  return 'albedo'
}

async function modelIO() {
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  await MeshoptSimplifier.ready
  return new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.WARN))
    // All Khronos extensions, so material extensions such as KHR_materials_transmission (clock
    // glass) survive instead of being dropped, which turned glass into an opaque cover.
    .registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP])
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    })
}

/**
 * Encoder preset for a texture inside a model. Normals stay three-channel XYZ: a glTF
 * normalTexture is read as RGB, so the two-channel `--normal_mode` packing that the
 * game's texture sets use would shade a model as if covered in blotches.
 */
export function modelEncodeRole(role) {
  if (role === 'normal') return 'normalRgb'
  if (role === 'orm') return 'orm'
  return 'albedo'
}

async function compressTextures(document, { limit, webp, env }) {
  const textures = document.getRoot().listTextures()
  if (textures.length === 0) return
  const scratch = await mkdtemp(join(tmpdir(), 'nestwright-model-'))
  try {
    if (webp) document.createExtension(EXTTextureWebP).setRequired(true)
    else document.createExtension(KHRTextureBasisu).setRequired(true)
    for (const texture of textures) {
      const image = texture.getImage()
      if (!image) continue
      const role = textureRole(document, texture)
      const resized = sharp(Buffer.from(image)).resize(limit, limit, { fit: 'inside', withoutEnlargement: true })
      if (webp) {
        texture.setImage(new Uint8Array(await resized.webp({ quality: 80 }).toBuffer()))
        texture.setMimeType('image/webp')
        continue
      }
      const png = join(scratch, `${texture.getName() || 'tex'}-${Math.random().toString(16).slice(2)}.png`)
      const ktx = png.replace(/\.png$/, '.ktx2')
      await resized.png().toFile(png)
      await encodeMap(modelEncodeRole(role), png, ktx, env)
      texture.setImage(new Uint8Array(await readFile(ktx)))
      texture.setMimeType('image/ktx2')
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

async function compressGeometry(document) {
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
}

/**
 * dedup, prune, resample, weld, then metres + bottom-centre.
 * The original bounds are the ones from before that transform.
 */
export async function prepareModel(document, scale, rotateY = 0) {
  await document.transform(dedup(), prune(), resample(), weld())
  const placed = applyBottomCentre(document, scale, rotateY)
  return placed
}

/**
 * Keep one node (and its children) from a file that lays several variants side by side.
 * The node keeps its world transform; everything else becomes unreferenced for prune().
 */
export function keepNode(document, name) {
  const scene = document.getRoot().listScenes()[0]
  if (!scene) throw new Error('glTF has no scene')
  const target = document.getRoot().listNodes().find((node) => node.getName() === name)
  if (!target) {
    const roots = scene.listChildren().map((node) => node.getName() || '(unnamed)')
    throw new Error(`node ${name} not found; scene roots are ${roots.join(', ')}`)
  }
  const world = target.getWorldMatrix()
  target.getParentNode()?.removeChild(target)
  for (const child of [...scene.listChildren()]) scene.removeChild(child)
  target.setMatrix(world)
  scene.addChild(target)
  return target
}

/**
 * Remove every primitive that uses one of the named materials (e.g. a glass pane exported
 * as an opaque JPEG with alphaMode BLEND, which hides the artwork behind it).
 */
export function dropMaterials(document, names) {
  const wanted = new Set(names)
  const found = new Set()
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const name = prim.getMaterial()?.getName()
      if (name && wanted.has(name)) {
        found.add(name)
        mesh.removePrimitive(prim)
        prim.dispose()
      }
    }
  }
  const missing = names.filter((name) => !found.has(name))
  if (missing.length) throw new Error(`dropMaterials: no primitive uses ${missing.join(', ')}`)
}

/**
 * Simplify LOD0 when it is over `maxTriangles`. The error bound is loose (5% of the mesh
 * extent), so the result can stay above the target on meshes that cannot collapse further.
 */
export async function capTriangles(document, maxTriangles) {
  const before = countTriangles(document)
  if (!maxTriangles || before <= maxTriangles) return before
  await MeshoptSimplifier.ready
  await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: maxTriangles / before, error: 0.05 }))
  return countTriangles(document)
}

/**
 * Remove every texture from a document while keeping materials, their factors and UVs.
 * LOD1 uses this so it does not carry a second copy of LOD0's images; the game copies the
 * maps from LOD0's material of the same name.
 */
export function stripTextures(document) {
  const root = document.getRoot()
  for (const material of root.listMaterials()) {
    material
      .setBaseColorTexture(null)
      .setNormalTexture(null)
      .setOcclusionTexture(null)
      .setMetallicRoughnessTexture(null)
      .setEmissiveTexture(null)
  }
  for (const texture of root.listTextures()) texture.dispose()
  for (const extension of root.listExtensionsUsed()) {
    if (extension.extensionName === KHRTextureBasisu.EXTENSION_NAME || extension.extensionName === EXTTextureWebP.EXTENSION_NAME) {
      extension.dispose()
    }
  }
  return document
}

export async function buildLod(document) {
  const copy = cloneDocument(document)
  await MeshoptSimplifier.ready
  await copy.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.01 }))
  stripTextures(copy)
  return copy
}

/**
 * Read a cached glTF, write `<key>.glb` and `<key>.lod1.glb`.
 * Textures become KTX2, or WebP when `webp` is set. Only LOD0 carries them.
 * `node` keeps one named node; `maxTriangles` simplifies LOD0 down toward that count;
 * `rotateY` (degrees) turns the model so its width runs along +X and its front faces +Z;
 * `drop` lists material names whose primitives are removed.
 */
export async function processModel(input, { key, outDir, scale = 1, resolution = '1k', webp = false, env, node, maxTriangles, rotateY = 0, drop = [] } = {}) {
  const io = await modelIO()
  const document = await io.read(input)
  document.setLogger(new Logger(Logger.Verbosity.WARN))
  if (node) keepNode(document, node)
  if (drop.length) dropMaterials(document, drop)
  const placed = await prepareModel(document, scale, rotateY)
  await capTriangles(document, maxTriangles)
  const lod = await buildLod(document)
  lod.setLogger(new Logger(Logger.Verbosity.WARN))
  await compressTextures(document, { limit: modelTextureLimit(resolution), webp, env })
  const triangles = countTriangles(document)
  const lodTriangles = countTriangles(lod)
  const materials = materialNames(document)
  await compressGeometry(document)
  await compressGeometry(lod)
  await mkdir(outDir, { recursive: true })
  const mainFile = join(outDir, `${key}.glb`)
  const lodFile = join(outDir, `${key}.lod1.glb`)
  await io.write(mainFile, document)
  await io.write(lodFile, lod)
  return {
    originalBounds: placed.original,
    bounds: placed.bounds,
    triangles,
    lodTriangles,
    materials,
    files: [mainFile, lodFile],
  }
}
