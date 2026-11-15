import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, EXTTextureWebP, KHRMaterialsTransmission, KHRMeshQuantization } from '@gltf-transform/extensions'
import { getBounds, prune } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { KTX_CREATE_ARGS, TOKTX_ARGS, encodeCommand } from '../../scripts/content/lib/ktx.mjs'
import { capTriangles, countTriangles, dropMaterials, keepNode, modelEncodeRole, processModel, stripTextures } from '../../scripts/content/lib/model.mjs'
import { applyBottomCentre } from '../../scripts/content/lib/place.mjs'
import { assertEntry } from '../../scripts/content/lib/sources.mjs'
import { unitsToMetres } from '../../scripts/content/lib/tile.mjs'

/** A grid of `n`×`n` quads on the XZ plane at height `y`, with UVs. */
function grid(doc, buffer, n, size, y) {
  const positions = []
  const uvs = []
  const indices = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      positions.push((i / n - 0.5) * size, y + Math.sin(i * 0.7) * Math.cos(j * 0.9) * 0.05, (j / n - 0.5) * size)
      uvs.push(i / n, j / n)
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2)
    }
  }
  return doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer))
}

async function texturedVariants() {
  const doc = new Document()
  const buffer = doc.createBuffer()
  // Not a solid colour: prune() would bake a solid texture into the material factor.
  const pixels = Buffer.alloc(8 * 8 * 3, 0).map((_, i) => (i * 37) % 256)
  const png = await sharp(pixels, { raw: { width: 8, height: 8, channels: 3 } }).png().toBuffer()
  const texture = doc.createTexture('wood').setImage(new Uint8Array(png)).setMimeType('image/png')
  const material = doc.createMaterial('Wood').setBaseColorTexture(texture)
  const scene = doc.createScene()
  const small = doc.createNode('variant_a').setMesh(doc.createMesh().addPrimitive(grid(doc, buffer, 4, 1, 0).setMaterial(material)))
  const big = doc.createNode('variant_b').setTranslation([3, 0, 0])
    .setMesh(doc.createMesh().addPrimitive(grid(doc, buffer, 40, 2, 0.5).setMaterial(material)))
  scene.addChild(small).addChild(big)
  return doc
}

async function readGlb(path) {
  await MeshoptDecoder.ready
  return new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP, KHRMaterialsTransmission])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    .read(path)
}

describe('model variants, triangle cap and LOD textures', () => {
  it('keeps one named node with its world position and rejects an unknown name', async () => {
    const doc = await texturedVariants()
    keepNode(doc, 'variant_b')
    const scene = doc.getRoot().listScenes()[0]
    expect(scene.listChildren().map((node) => node.getName())).toEqual(['variant_b'])
    expect(getBounds(scene).min[0]).toBeCloseTo(2, 5)
    expect(() => keepNode(doc, 'nope')).toThrow(/node nope not found; scene roots are variant_b/)
  })

  it('simplifies LOD0 toward maxTriangles and leaves small meshes alone', async () => {
    const doc = await texturedVariants()
    keepNode(doc, 'variant_b')
    await doc.transform(prune())
    const before = countTriangles(doc)
    expect(before).toBe(3200)
    expect(await capTriangles(doc, 5000)).toBe(3200)
    const after = await capTriangles(doc, 800)
    expect(after).toBeLessThan(before * 0.5)
  })

  it('strips textures but keeps materials and UVs', async () => {
    const doc = await texturedVariants()
    stripTextures(doc)
    expect(doc.getRoot().listTextures()).toHaveLength(0)
    expect(doc.getRoot().listMaterials().map((material) => material.getName())).toEqual(['Wood'])
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0]
    expect(prim.getAttribute('TEXCOORD_0')).not.toBeNull()
  })

  it('writes LOD1 without a second copy of the textures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nestwright-model-test-'))
    const input = join(dir, 'in.glb')
    await writeFile(input, await new NodeIO().writeBinary(await texturedVariants()))
    const result = await processModel(input, { key: 'thing', outDir: dir, webp: true, node: 'variant_b' })
    expect(result.triangles).toBe(3200)
    expect(result.lodTriangles).toBeLessThan(3200)
    expect(result.bounds.w).toBeCloseTo(2, 2)
    const lod0 = await readGlb(join(dir, 'thing.glb'))
    const lod1 = await readGlb(join(dir, 'thing.lod1.glb'))
    expect(lod0.getRoot().listTextures()).toHaveLength(1)
    expect(lod1.getRoot().listTextures()).toHaveLength(0)
    expect(lod1.getRoot().listExtensionsUsed().map((ext) => ext.extensionName)).not.toContain('EXT_texture_webp')
    expect(lod1.getRoot().listMaterials().map((material) => material.getName())).toEqual(['Wood'])
    const lodPrim = lod1.getRoot().listMeshes()[0].listPrimitives()[0]
    expect(lodPrim.getAttribute('TEXCOORD_0')).not.toBeNull()
    const lod1Bytes = (await stat(join(dir, 'thing.lod1.glb'))).size
    const lod0Bytes = (await stat(join(dir, 'thing.glb'))).size
    expect(lod1Bytes).toBeLessThan(lod0Bytes)
    expect((await readFile(join(dir, 'thing.lod1.glb'))).includes(Buffer.from('WEBP'))).toBe(false)
  })

  it('keeps KHR_materials_transmission on glass', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nestwright-model-test-'))
    const doc = await texturedVariants()
    const transmission = doc.createExtension(KHRMaterialsTransmission)
    const glass = doc.createMaterial('Glass').setExtension('KHR_materials_transmission', transmission.createTransmission().setTransmissionFactor(1))
    doc.getRoot().listMeshes()[0].listPrimitives()[0].setMaterial(glass)
    const input = join(dir, 'glass.glb')
    await writeFile(input, await new NodeIO().registerExtensions([KHRMaterialsTransmission]).writeBinary(doc))
    await processModel(input, { key: 'glass', outDir: dir, webp: true, node: 'variant_a' })
    const out = await readGlb(join(dir, 'glass.glb'))
    const material = out.getRoot().listMaterials().find((item) => item.getName() === 'Glass')
    expect(material?.getExtension('KHR_materials_transmission')?.getTransmissionFactor()).toBe(1)
  })

  it('encodes model normals as plain RGB, not the two-channel texture-set packing', () => {
    expect(modelEncodeRole('normal')).toBe('normalRgb')
    expect(modelEncodeRole('orm')).toBe('orm')
    expect(modelEncodeRole('albedo')).toBe('albedo')
    expect(TOKTX_ARGS.normalRgb).not.toContain('--normal_mode')
    expect(TOKTX_ARGS.normalRgb).toContain('uastc')
    expect(KTX_CREATE_ARGS.normalRgb).not.toContain('--normal-mode')
    expect(encodeCommand({ bin: 'toktx', kind: 'toktx' }, modelEncodeRole('normal'), 'n.png', 'n.ktx2').args).not.toContain('--normal_mode')
  })

  it('drops primitives by material name and refuses a name nothing uses', async () => {
    const doc = await texturedVariants()
    const pane = doc.createMaterial('Glass')
    doc.getRoot().listMeshes()[0].listPrimitives()[0].setMaterial(pane)
    dropMaterials(doc, ['Glass'])
    expect(doc.getRoot().listMeshes()[0].listPrimitives()).toHaveLength(0)
    expect(doc.getRoot().listMeshes()[1].listPrimitives()).toHaveLength(1)
    expect(() => dropMaterials(doc, ['Glass'])).toThrow(/no primitive uses Glass/)
    const base = { key: 'frame', kind: 'model', provider: 'polyhaven', sourceId: 'f', resolution: '1k', licence: 'CC0', targets: {} }
    expect(() => assertEntry({ ...base, dropMaterials: ['Glass'] })).not.toThrow()
    expect(() => assertEntry({ ...base, dropMaterials: [] })).toThrow(/dropMaterials/)
  })

  it('accepts node and maxTriangles only on model entries', () => {
    const base = { key: 'shrub', kind: 'model', provider: 'polyhaven', sourceId: 'shrub_02', resolution: '1k', licence: 'CC0', targets: {} }
    expect(() => assertEntry({ ...base, node: 'shrub_02_b', maxTriangles: 20000 })).not.toThrow()
    expect(() => assertEntry({ ...base, node: '' })).toThrow(/node must be/)
    expect(() => assertEntry({ ...base, maxTriangles: 12.5 })).toThrow(/maxTriangles/)
    expect(() => assertEntry({ ...base, kind: 'texture', maxTriangles: 2000 })).toThrow(/maxTriangles/)
    expect(() => assertEntry({ ...base, rotateY: 90 })).not.toThrow()
    expect(() => assertEntry({ ...base, rotateY: 45 })).toThrow(/rotateY/)
  })

  it('turns a model about Y and reads decimetres', async () => {
    expect(unitsToMetres('dm')).toBe(0.1)
    const doc = await texturedVariants()
    keepNode(doc, 'variant_a')
    await doc.transform(prune())
    // variant_a is a 1×1 grid; stretch it to 2 m along X first.
    doc.getRoot().listNodes()[0].setScale([2, 1, 1])
    const placed = applyBottomCentre(doc, 0.1, 90)
    expect(placed.original.w).toBeCloseTo(2, 5)
    expect(placed.bounds.w).toBeCloseTo(0.1, 5)
    expect(placed.bounds.d).toBeCloseTo(0.2, 5)
    const box = getBounds(doc.getRoot().listScenes()[0])
    expect(box.min[1]).toBeCloseTo(0, 5)
    expect((box.min[2] + box.max[2]) / 2).toBeCloseTo(0, 5)
  })
})
