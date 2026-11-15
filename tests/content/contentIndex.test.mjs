import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { parseArgs } from '../../scripts/content/lib/cli.mjs'
import { buildContentIndex } from '../../scripts/content/lib/contentIndex.mjs'
import { applyAlbedoContrast } from '../../scripts/content/lib/image.mjs'
import { assertEntry } from '../../scripts/content/lib/sources.mjs'
import { ormMeans } from '../../scripts/content/lib/textures.mjs'

const manifest = (key, materialId, extra = {}) => ({
  key,
  kind: 'texture',
  targets: { materialId },
  files: [
    { path: `textures/${key}/albedo.ktx2` },
    { path: `textures/${key}/normal.ktx2` },
    { path: `textures/${key}/orm.ktx2` },
  ],
  texture: { meanAlbedoSrgb: [100, 90, 80], tileMeters: 1.5, ...extra },
})

describe('content index', () => {
  it('lists texture sets by material id with their maps and stats', () => {
    const index = buildContentIndex([
      manifest('b-tex', 'b', { meanOrm: [1, 0.6, 0] }),
      manifest('a-tex', 'a'),
      { key: 'chair', kind: 'model', targets: { catalogId: 'chair' }, files: [] },
    ])
    expect(index.version).toBe(1)
    expect(Object.keys(index.textures)).toEqual(['a', 'b'])
    expect(index.textures.b).toEqual({
      key: 'b-tex',
      tileMeters: 1.5,
      meanAlbedoSrgb: [100, 90, 80],
      meanOrm: [1, 0.6, 0],
      maps: { albedo: 'textures/b-tex/albedo.ktx2', normal: 'textures/b-tex/normal.ktx2', orm: 'textures/b-tex/orm.ktx2' },
    })
    expect(index.textures.a.meanOrm).toBeUndefined()
  })

  it('lists models by catalog id with both LODs, and credits every asset', () => {
    const index = buildContentIndex([
      manifest('a-tex', 'a'),
      {
        key: 'sofa-02-model',
        kind: 'model',
        sourceId: 'sofa_02',
        author: 'Someone',
        licence: 'CC0',
        sourceUrl: 'https://polyhaven.com/a/sofa_02',
        targets: { catalogId: 'sofa-3' },
        files: [{ path: 'models/sofa-02-model/sofa-02-model.glb' }, { path: 'models/sofa-02-model/sofa-02-model.lod1.glb' }],
        model: { bounds: { w: 1.8, d: 0.8, h: 0.7 }, triangles: 2728 },
      },
      { key: 'flower-model', kind: 'model', targets: { species: 'flowers' }, files: [{ path: 'models/flower-model/flower-model.glb' }] },
    ])
    expect(index.models).toEqual({
      'sofa-3': {
        key: 'sofa-02-model',
        lod0: 'models/sofa-02-model/sofa-02-model.glb',
        lod1: 'models/sofa-02-model/sofa-02-model.lod1.glb',
        bounds: { w: 1.8, d: 0.8, h: 0.7 },
        triangles: 2728,
      },
    })
    expect(index.credits.map((c) => c.key)).toEqual(['a-tex', 'flower-model', 'sofa-02-model'])
    expect(index.credits[2]).toEqual({
      key: 'sofa-02-model',
      kind: 'model',
      name: 'Sofa 02',
      author: 'Someone',
      licence: 'CC0',
      sourceUrl: 'https://polyhaven.com/a/sofa_02',
    })
  })

  it('averages the packed ORM, using the fills for missing maps', async () => {
    expect(await ormMeans({}, 4, 4)).toEqual([1, 0.502, 0])
  })

  it('carries normalScale into the index', () => {
    const index = buildContentIndex([manifest('p-tex', 'p', { normalScale: 0.45 })])
    expect(index.textures.p.normalScale).toBe(0.45)
  })

  it('flattens albedo toward the mean in linear light', () => {
    // Two texels, black and white: linear mean 0.5 → sRGB 188.
    const raw = Buffer.from([0, 0, 0, 255, 255, 255])
    applyAlbedoContrast(raw, 3, 0)
    expect([...raw]).toEqual([188, 188, 188, 188, 188, 188])
    const half = Buffer.from([0, 0, 0, 255, 255, 255])
    applyAlbedoContrast(half, 3, 0.5)
    // Linear 0.25 and 0.75 → sRGB 137 and 225; the linear mean is unchanged.
    expect([...half]).toEqual([137, 137, 137, 225, 225, 225])
    const keep = Buffer.from([10, 20, 30, 200, 210, 220])
    applyAlbedoContrast(keep, 3, 1)
    expect([...keep]).toEqual([10, 20, 30, 200, 210, 220])
  })

  it('lerps AO toward white with the same strength', async () => {
    expect((await ormMeans({}, 4, 4, 0.2))[0]).toBe(1)
  })

  it('validates albedoContrast and normalScale on a source entry', () => {
    const entry = { key: 'a-tex', kind: 'texture', provider: 'polyhaven', sourceId: 'x', resolution: '2k', licence: 'CC0', targets: { materialId: 'a' } }
    expect(() => assertEntry({ ...entry, albedoContrast: 0.2, normalScale: 0.5 })).not.toThrow()
    expect(() => assertEntry({ ...entry, albedoContrast: 1.5 })).toThrow(/albedoContrast/)
    expect(() => assertEntry({ ...entry, normalScale: 0 })).toThrow(/normalScale/)
  })

  it('parses --stats and --gzip', () => {
    expect(parseArgs(['--stats', '--gzip'])).toMatchObject({ stats: true, gzip: true })
  })
})
