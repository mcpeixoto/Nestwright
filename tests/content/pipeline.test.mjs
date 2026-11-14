import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import { Document } from '@gltf-transform/core'
import { getBounds } from '@gltf-transform/functions'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ambientMapRole, ambientSpanToMetres, pickAmbientDownload } from '../../scripts/content/lib/ambientcg.mjs'
import { parseArgs } from '../../scripts/content/lib/cli.mjs'
import { sourceDigest, sha256Text, digestsMatch } from '../../scripts/content/lib/hash.mjs'
import { USER_AGENT, fetchJson } from '../../scripts/content/lib/http.mjs'
import { loadIds } from '../../scripts/content/lib/ids.mjs'
import { meanSrgb, ormFillByte, ormPlan } from '../../scripts/content/lib/image.mjs'
import { TOKTX_ARGS, encodeCommand, resolveEncoder } from '../../scripts/content/lib/ktx.mjs'
import { reviewLicence } from '../../scripts/content/lib/licence.mjs'
import { fetchPackPlan, nextArchive, releaseTag, reviewLock } from '../../scripts/content/lib/lock.mjs'
import { manifestErrors, renderAssetsDoc } from '../../scripts/content/lib/manifest.mjs'
import { applyBottomCentre, bottomCentreOffset, boundsSize } from '../../scripts/content/lib/place.mjs'
import { assertPolyhavenCc0, pickPolyhaven, polyhavenTileMeters } from '../../scripts/content/lib/polyhaven.mjs'
import { withRetry } from '../../scripts/content/lib/retry.mjs'
import { assertEntry, selectEntries } from '../../scripts/content/lib/sources.mjs'
import { resolveTileMeters, unitsToMetres } from '../../scripts/content/lib/tile.mjs'
import { buildOrmPng } from '../../scripts/content/lib/textures.mjs'
import { unzipBuffer } from '../../scripts/content/lib/unzip.mjs'
import { validateState } from '../../scripts/content/lib/validate.mjs'
import { repoRoot } from '../../scripts/content/lib/paths.mjs'

const textureFiles = JSON.parse(readFileSync(new globalThis.URL('./fixtures/polyhaven-files-texture.json', import.meta.url)))
const modelFiles = JSON.parse(readFileSync(new globalThis.URL('./fixtures/polyhaven-files-model.json', import.meta.url)))
const hdriFiles = JSON.parse(readFileSync(new globalThis.URL('./fixtures/polyhaven-files-hdri.json', import.meta.url)))
const ambient = JSON.parse(readFileSync(new globalThis.URL('./fixtures/ambientcg-full.json', import.meta.url)))
const sha = (char) => char.repeat(64)

describe('licence filter', () => {
  it('allows CC0 and CC-BY 4.0 only', () => {
    expect(reviewLicence('CC0').allowed).toBe(true)
    expect(reviewLicence('CC-BY-4.0').allowed).toBe(true)
    expect(reviewLicence('cc-by-4.0').allowed).toBe(true)
    for (const licence of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-SA-4.0', 'CC-BY', 'MIT']) {
      expect(reviewLicence(licence).allowed).toBe(false)
    }
    expect(reviewLicence('CC-BY-NC-SA-4.0').banned).toEqual(expect.arrayContaining(['NC', 'SA']))
    expect(reviewLicence('CC-BY-ND-4.0').banned).toContain('ND')
  })

  it('requires a credit on CC-BY entries and CC0 on hosted providers', () => {
    expect(() => assertEntry({
      key: 'chair', kind: 'model', provider: 'sketchfab', sourceId: 'abc', resolution: '1k',
      licence: 'CC-BY-4.0', targets: {},
    })).toThrow(/author and url/)
    expect(() => assertEntry({
      key: 'oak', kind: 'texture', provider: 'polyhaven', sourceId: 'wood', resolution: '1k',
      licence: 'CC-BY-4.0', author: 'Ada', url: 'https://example.invalid', targets: {},
    })).toThrow(/CC0/)
  })
})

describe('Poly Haven file picker', () => {
  it('picks jpg albedo, OpenGL normal, and optional maps at the asked resolution', () => {
    const picked = pickPolyhaven(textureFiles, { kind: 'texture', resolution: '1k' })
    expect(picked.maps.albedo).toMatchObject({ ext: 'jpg', size: 100 })
    expect(picked.maps.normal.url).toContain('nor_gl')
    expect(picked.maps.metalness.ext).toBe('png')
    expect(JSON.stringify(picked)).not.toContain('nor_dx')
    expect(picked.maps.displacement.size).toBe(70)
  })

  it('picks the gltf plus its include list, and the hdr rather than the exr', () => {
    const model = pickPolyhaven(modelFiles, { kind: 'model', resolution: '1k' })
    expect(model.gltf.url).toContain('.gltf')
    expect(model.include.map((file) => file.path)).toEqual(['example.bin', 'textures/example_diff_1k.jpg'])
    const hdri = pickPolyhaven(hdriFiles, { kind: 'hdri', resolution: '1k' })
    expect(hdri.hdr.url).toContain('.hdr')
    expect(hdri.hdr.size).toBe(50)
  })

  it('treats a Poly Haven info payload without a licence field as CC0', () => {
    expect(() => assertPolyhavenCc0({ authors: { Ada: 'All' }, dimensions: [50000, 50000] })).not.toThrow()
    expect(() => assertPolyhavenCc0({ licence: 'CC-BY-NC-4.0' })).toThrow(/not CC0/)
    expect(polyhavenTileMeters({ dimensions: [50000, 50000] }, null)).toBe(50)
  })
})

describe('ambientCG maps', () => {
  it('selects the 1K-JPG zip', () => {
    const picked = pickAmbientDownload(ambient, '1k')
    expect(picked.fileName).toBe('WoodFloor024_1K-JPG.zip')
    expect(picked.size).toBe(5403996)
  })

  it('maps Color / NormalGL / Roughness / Metalness / AmbientOcclusion / Displacement', () => {
    expect(ambientMapRole('WoodFloor024_1K-JPG_Color.jpg')).toBe('albedo')
    expect(ambientMapRole('WoodFloor024_1K-JPG_NormalGL.jpg')).toBe('normal')
    expect(ambientMapRole('WoodFloor024_1K-JPG_NormalDX.jpg')).toBe(null)
    expect(ambientMapRole('WoodFloor024_1K-JPG_Roughness.jpg')).toBe('roughness')
    expect(ambientMapRole('WoodFloor024_1K-JPG_Metalness.jpg')).toBe('metalness')
    expect(ambientMapRole('WoodFloor024_1K-JPG_AmbientOcclusion.jpg')).toBe('ao')
    expect(ambientMapRole('WoodFloor024_1K-JPG_Displacement.jpg')).toBe('displacement')
  })

  it('reads dimensionX as metres, or millimetres when the number is a raw scan size', () => {
    expect(ambientSpanToMetres(0)).toBe(null)
    expect(ambientSpanToMetres(2)).toBe(2)
    expect(ambientSpanToMetres(50000)).toBe(50)
  })
})

describe('ORM plan and mean albedo', () => {
  it('puts AO in red (white if absent) and metalness in blue (black if absent)', () => {
    const plan = ormPlan({ ao: false, roughness: true, metalness: false })
    expect(plan).toEqual({ r: 'white', g: 'roughness', b: 'black' })
    expect(ormFillByte(plan.r)).toBe(255)
    expect(ormFillByte(plan.g)).toBe(null)
    expect(ormFillByte(plan.b)).toBe(0)
  })

  it('averages interleaved sRGB samples', () => {
    const raw = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255])
    expect(meanSrgb(raw, 3)).toEqual([127.5, 127.5, 127.5])
  })

  it('packs a constant ORM image when maps are missing', async () => {
    const png = await buildOrmPng({}, 2, 2)
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(info.width).toBe(2)
    expect([...data.subarray(0, 3)]).toEqual([255, 128, 0])
  })
})

describe('tile metres and bottom centre', () => {
  it('prefers Poly Haven millimetres, then the entry', () => {
    expect(resolveTileMeters({ dimensionsMm: [1200, 800] })).toBe(1.2)
    expect(resolveTileMeters({ dimensionsMm: [0, 0], entryTileMeters: 0.6 })).toBe(0.6)
    expect(resolveTileMeters({})).toBe(null)
    expect(unitsToMetres('cm')).toBe(0.01)
    expect(unitsToMetres('mm')).toBe(0.001)
  })

  it('computes the translation onto the bottom centre', () => {
    expect(boundsSize([-2, 1, 0], [2, 3, 4])).toEqual({ w: 4, d: 4, h: 2 })
    expect(bottomCentreOffset([-2, 1, 0], [2, 3, 4])).toEqual({ x: 0, y: -1, z: -2 })
  })

  it('moves a glTF so min y is 0 and x/z are centred', () => {
    const doc = new Document()
    const buffer = doc.createBuffer()
    const position = doc.createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([-2, 1, 0, 2, 1, 4, 0, 3, 2]))
      .setBuffer(buffer)
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(
      doc.createPrimitive().setAttribute('POSITION', position),
    )))
    const placed = applyBottomCentre(doc, 1)
    expect(placed.original).toEqual({ w: 4, d: 4, h: 2 })
    const box = getBounds(doc.getRoot().listScenes()[0])
    expect(box.min[1]).toBeCloseTo(0, 5)
    expect((box.min[0] + box.max[0]) / 2).toBeCloseTo(0, 5)
    expect((box.min[2] + box.max[2]) / 2).toBeCloseTo(0, 5)
    expect(placed.bounds.h).toBeCloseTo(2, 5)
  })
})

describe('manifest, lock and ids', () => {
  const ids = loadIds(repoRoot)

  function manifest(over = {}) {
    return {
      key: 'oak-planks',
      kind: 'texture',
      provider: 'polyhaven',
      sourceId: 'wood',
      sourceUrl: 'https://polyhaven.com/a/wood',
      author: 'Ada',
      licence: 'CC0',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      sha256Source: sha('a'),
      files: [{ path: 'textures/oak-planks/albedo.ktx2', bytes: 10, sha256: sha('b') }],
      targets: { materialId: 'oak-planks' },
      texture: { meanAlbedoSrgb: [180, 140, 90], tileMeters: 1.2 },
      ...over,
    }
  }

  it('accepts a texture manifest and rejects a missing credit', () => {
    expect(manifestErrors(manifest())).toEqual([])
    expect(manifestErrors(manifest({ licence: 'CC-BY-4.0', author: '', sourceUrl: '' })).join('\n')).toMatch(/CC-BY/)
    expect(manifestErrors(manifest({ licence: 'CC-BY-SA-4.0' })).join('\n')).toMatch(/not allowed/)
  })

  it('checks target ids and skips missing files until public/content exists', () => {
    expect(ids.materials.has('plaster-white')).toBe(true)
    expect(ids.catalog.has('sofa-2')).toBe(true)
    expect(ids.species.has('oak')).toBe(true)
    const bad = manifest({
      targets: { materialId: 'not-a-material', catalogId: 'not-a-prop', species: 'dragon' },
    })
    const errors = validateState({
      sources: [],
      manifests: [bad, manifest()],
      ids,
      lock: { version: 0, tarball: null, sha256: null },
      outputExists: false,
      fileExists: () => false,
    })
    expect(errors.join('\n')).toMatch(/materialId/)
    expect(errors.join('\n')).toMatch(/catalogId/)
    expect(errors.join('\n')).toMatch(/species/)
    expect(errors.join('\n')).not.toMatch(/missing file/)
    const missing = validateState({
      sources: [],
      manifests: [manifest(), manifest()],
      ids,
      lock: { version: 0, tarball: null, sha256: null },
      outputExists: true,
      fileExists: () => false,
    })
    expect(missing.join('\n')).toMatch(/duplicate manifest key/)
    expect(missing.join('\n')).toMatch(/missing file/)
  })

  it('keeps the asset policy header when there is nothing to list', () => {
    const existing = readFileSync(join(repoRoot, 'docs/ASSETS.md'), 'utf8')
    expect(renderAssetsDoc(existing, [])).toBe(existing)
    const rendered = renderAssetsDoc(existing, [manifest()])
    expect(rendered).toContain('NC, ND, and SA licences are not allowed.')
    expect(rendered).toContain('| oak-planks | https://polyhaven.com/a/wood |')
    expect(rendered).not.toContain('No third-party assets yet.')
  })

  it('round-trips the content lock and the pack name', () => {
    expect(reviewLock({ version: 0, tarball: null, sha256: null })).toEqual([])
    expect(reviewLock({ version: 1, tarball: 'content-v1.tar.zst', sha256: sha('c') })).toEqual([])
    expect(reviewLock({ version: 1, tarball: 'content-v1.tar.zst', sha256: null })).not.toEqual([])
    expect(nextArchive({ version: 0 }, 'zstd').tarball).toBe('content-v1.tar.zst')
    expect(nextArchive({ version: 2 }, 'gzip').tarball).toBe('content-v3.tar.gz')
    expect(releaseTag('content-v3.tar.zst')).toBe('content-v3')
    expect(fetchPackPlan({ tarball: null }).message).toBe('no content pack; procedural fallback')
    expect(digestsMatch(sha('a'), sha('a'))).toBe(true)
    expect(digestsMatch(sha('a'), sha('b'))).toBe(false)
    const files = [{ name: 'b.jpg', sha256: sha('b'), bytes: 2 }, { name: 'a.jpg', sha256: sha('a'), bytes: 1 }]
    expect(sourceDigest(files)).toBe(sourceDigest([...files].reverse()))
    expect(sourceDigest(files)).toBe(sha256Text(`a.jpg ${sha('a')} 1\nb.jpg ${sha('b')} 2`))
  })
})

describe('encoder flags and zip', () => {
  it('uses the toktx 4.4.2 flags, with ktx create as the fallback', () => {
    expect(TOKTX_ARGS.albedo).toEqual(['--t2', '--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--genmipmap', '--assign_oetf', 'srgb'])
    expect(TOKTX_ARGS.orm).toContain('--assign_oetf')
    expect(TOKTX_ARGS.orm).toContain('linear')
    expect(TOKTX_ARGS.normal).toEqual(['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--normal_mode', '--assign_oetf', 'linear'])
    const toktx = encodeCommand({ bin: 'toktx', kind: 'toktx' }, 'albedo', 'in.png', 'out.ktx2')
    expect(toktx.args.at(-2)).toBe('out.ktx2')
    expect(toktx.args.at(-1)).toBe('in.png')
    const ktx = encodeCommand({ bin: 'ktx', kind: 'ktx' }, 'normal', 'in.png', 'out.ktx2')
    expect(ktx.args.slice(0, 4)).toEqual(['create', '--format', 'R8G8B8A8_UNORM', '--encode'])
    expect(ktx.args.at(-2)).toBe('in.png')
    expect(ktx.args.at(-1)).toBe('out.ktx2')
    const resolved = resolveEncoder({ KTX_BIN: '/opt/ktx/bin' }, '/home/me', (path) => path.endsWith('/ktx'))
    expect(resolved).toEqual({ bin: '/opt/ktx/bin/ktx', kind: 'ktx' })
  })

  it('inflates a stored zip and rejects traversal', () => {
    const payload = Buffer.from('albedo')
    const name = Buffer.from('Color.jpg')
    const crc = crc32(payload) >>> 0
    const local = Buffer.alloc(30 + name.length + payload.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(payload.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    payload.copy(local, 30 + name.length)
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(payload.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(local.length, 42)
    name.copy(central, 46)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(1, 8)
    end.writeUInt16LE(1, 10)
    end.writeUInt32LE(central.length, 12)
    end.writeUInt32LE(local.length, 16)
    return mkdtemp(join(tmpdir(), 'nestwright-zip-')).then(async (dir) => {
      unzipBuffer(Buffer.concat([local, central, end]), dir)
      expect(await readFile(join(dir, 'Color.jpg'), 'utf8')).toBe('albedo')
      expect(() => unzipBuffer(localWithName('../x.txt', payload), dir)).toThrow(/unsafe zip path/)
    })
  })
})

describe('http and argv', () => {
  it('sends the required user agent and retries three times', async () => {
    let seen
    await fetchJson('https://api.polyhaven.com/info/example', {
      sleep: async () => {},
      fetchImpl: async (_url, init) => {
        seen = init.headers
        return { ok: true, json: async () => ({ name: 'example' }) }
      },
    })
    expect(seen['User-Agent']).toBe(USER_AGENT)
    let attempts = 0
    await expect(withRetry(async () => {
      attempts += 1
      throw new Error('down')
    }, { sleep: async () => {} })).rejects.toThrow(/down/)
    expect(attempts).toBe(3)
  })

  it('parses --only and rejects unknown flags', () => {
    expect(parseArgs(['--dry-run', '--only', 'a,b', '--webp'])).toMatchObject({ dryRun: true, webp: true, only: ['a', 'b'] })
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/)
    expect(() => selectEntries([{ key: 'a' }], ['missing'])).toThrow(/unknown source key/)
  })
})

function localWithName(name, payload) {
  const nameBuf = Buffer.from(name)
  const crc = crc32(payload) >>> 0
  const local = Buffer.alloc(30 + nameBuf.length + payload.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(0, 8)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(payload.length, 18)
  local.writeUInt32LE(payload.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  nameBuf.copy(local, 30)
  payload.copy(local, 30 + nameBuf.length)
  return local
}
