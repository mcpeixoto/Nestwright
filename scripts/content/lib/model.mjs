import { Logger, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions'
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
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu, EXTTextureWebP])
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    })
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
      await encodeMap(role === 'normal' ? 'normal' : role === 'orm' ? 'orm' : 'albedo', png, ktx, env)
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
export async function prepareModel(document, scale) {
  await document.transform(dedup(), prune(), resample(), weld())
  const placed = applyBottomCentre(document, scale)
  return placed
}

export async function buildLod(document) {
  const copy = cloneDocument(document)
  await MeshoptSimplifier.ready
  await copy.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.01 }))
  return copy
}

/**
 * Read a cached glTF, write `<key>.glb` and `<key>.lod1.glb`.
 * Textures become KTX2, or WebP when `webp` is set.
 */
export async function processModel(input, { key, outDir, scale = 1, resolution = '1k', webp = false, env } = {}) {
  const io = await modelIO()
  const document = await io.read(input)
  document.setLogger(new Logger(Logger.Verbosity.WARN))
  const placed = await prepareModel(document, scale)
  await compressTextures(document, { limit: modelTextureLimit(resolution), webp, env })
  const lod = await buildLod(document)
  lod.setLogger(new Logger(Logger.Verbosity.WARN))
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
