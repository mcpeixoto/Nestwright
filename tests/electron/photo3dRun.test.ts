import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runPhoto3d } from '../../electron/photo3dRun'

const FAKE = path.join(process.cwd(), 'tests/fixtures/fake-photo3d.mjs')
const dir = mkdtempSync(path.join(tmpdir(), 'nestwright-p3d-'))
let n = 0

function start(mode: string, extra: { images?: string[]; timeoutMs?: number } = {}) {
  const out = path.join(dir, `out-${n++}.glb`)
  const progress: { value: number; stage: string }[] = []
  const run = runPhoto3d({
    command: FAKE,
    images: extra.images ?? ['/photos/sofa front.jpg'],
    quality: 'fast',
    out,
    timeoutMs: extra.timeoutMs,
    env: { ...process.env, FAKE_PHOTO3D_MODE: mode },
    onProgress: (value, stage) => progress.push({ value, stage }),
  })
  return { run, out, progress }
}

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Each case spawns a real Node process; under a loaded machine that alone can pass 5 s.
describe('runPhoto3d with a fake converter', { timeout: 30_000 }, () => {
  it('forwards progress, returns the GLB as base64 and deletes the temp file', async () => {
    const { run, out, progress } = start('ok', { images: ['/p/a b.jpg', '/p/x;echo hi.jpg'] })
    const result = await run.result
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const bytes = Buffer.from(result.data, 'base64')
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('glTF')
    // Two argv entries reached the converter as two photos: nothing was split by a shell.
    expect(progress).toEqual([
      { value: 0.5, stage: 'meshing 2 photos' },
      { value: 1, stage: 'writing' },
    ])
    expect(existsSync(out)).toBe(false)
  })

  it('joins progress lines the converter writes in pieces', async () => {
    const { run, progress } = start('split')
    expect((await run.result).ok).toBe(true)
    expect(progress[0]).toEqual({ value: 0.25, stage: 'segmenting' })
  })

  it('reports the converter ERROR message', async () => {
    const result = await start('error').run.result
    expect(result).toEqual({ ok: false, error: 'no furniture found in the photo' })
  })

  it('falls back to the last stderr line when the converter dies without ERROR', async () => {
    const result = await start('silent-fail').run.result
    expect(result).toEqual({ ok: false, error: 'Traceback: something broke' })
  })

  it('fails when the converter exits 0 without a model', async () => {
    const result = await start('no-model').run.result
    expect(result.ok).toBe(false)
  })

  it('cancels a running converter', async () => {
    const { run, progress } = start('hang')
    while (progress.length === 0) await new Promise((resolve) => setTimeout(resolve, 20))
    run.cancel()
    expect(await run.result).toEqual({ ok: false, error: 'Cancelled', cancelled: true })
  })

  it('stops a converter that runs past the timeout', async () => {
    const result = await start('hang', { timeoutMs: 300 }).run.result
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/too long/)
  })

  it('reports a command that does not exist', async () => {
    const run = runPhoto3d({ command: path.join(dir, 'missing'), images: ['/a.jpg'], quality: 'fast', out: path.join(dir, 'x.glb') })
    const result = await run.result
    expect(result.ok).toBe(false)
  })
})
