import { describe, expect, it } from 'vitest'
import { parseArgs } from '../../scripts/content/lib/cli.mjs'
import { buildContentIndex } from '../../scripts/content/lib/contentIndex.mjs'
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

  it('averages the packed ORM, using the fills for missing maps', async () => {
    expect(await ormMeans({}, 4, 4)).toEqual([1, 0.502, 0])
  })

  it('parses --stats and --gzip', () => {
    expect(parseArgs(['--stats', '--gzip'])).toMatchObject({ stats: true, gzip: true })
  })
})
