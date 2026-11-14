import { describe, expect, it } from 'vitest'
import type { GraphicsQuality } from '../../src/settings'
import {
  BENCHMARK_MS,
  BENCHMARK_TIER,
  MAX_FRAMES,
  WARMUP_FRAMES,
  median,
  pickTier,
  runBenchmark,
  shouldBenchmark,
  type BenchmarkHost,
} from '../../src/view3d/render/autoTier'

/** A fake GPU: each frame costs `frameMs` of virtual time, warm-up frames cost `warmMs`. */
function fakeHost(frameMs: number, options: { warmMs?: number; dieAfter?: number } = {}) {
  let clock = 0
  let frames = 0
  const tiers: GraphicsQuality[] = []
  const host: BenchmarkHost = {
    render(tier) {
      tiers.push(tier)
      frames += 1
      clock += frames <= WARMUP_FRAMES ? (options.warmMs ?? frameMs) : frameMs
    },
    finish: () => Promise.resolve(),
    now: () => clock,
    alive: () => options.dieAfter === undefined || frames < options.dieAfter,
  }
  return { host, tiers, frames: () => frames }
}

describe('auto tier decision', () => {
  it('picks the highest tier whose budget a Medium frame fits', () => {
    expect(pickTier(2)).toBe('ultra')
    expect(pickTier(5)).toBe('ultra')
    expect(pickTier(5.1)).toBe('high')
    expect(pickTier(11)).toBe('high')
    expect(pickTier(11.5)).toBe('medium')
    expect(pickTier(16)).toBe('medium')
    expect(pickTier(16.7)).toBe('low')
    expect(pickTier(40)).toBe('low')
  })

  it('falls back to medium when timing is unusable', () => {
    expect(pickTier(Number.NaN)).toBe('medium')
    expect(pickTier(0)).toBe('medium')
    expect(pickTier(-3)).toBe('medium')
  })

  it('takes a robust median', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([1, 1, 1, 90])).toBe(1)
    expect(median([Number.NaN, 2, -1])).toBe(2)
    expect(median([])).toBeNaN()
  })
})

describe('auto tier benchmark', () => {
  it('renders on Medium, ignores slow warm-up frames, and stops at the frame cap', async () => {
    const { host, tiers, frames } = fakeHost(4, { warmMs: 300 })
    const result = await runBenchmark(host)
    expect(result?.tier).toBe('ultra')
    expect(result?.medianMs).toBe(4)
    expect(new Set(tiers)).toEqual(new Set([BENCHMARK_TIER]))
    expect(frames()).toBe(WARMUP_FRAMES + Math.min(MAX_FRAMES, BENCHMARK_MS / 4))
  })

  it('stops after the time budget on a slow machine', async () => {
    const { host } = fakeHost(25)
    const result = await runBenchmark(host)
    expect(result?.tier).toBe('low')
    expect(result?.frames).toBe(BENCHMARK_MS / 25)
  })

  it('gives up when the view goes away', async () => {
    const { host } = fakeHost(4, { dieAfter: WARMUP_FRAMES + 3 })
    expect(await runBenchmark(host)).toBeNull()
  })

  it('gives up with too few frames to trust', async () => {
    const { host } = fakeHost(400)
    expect(await runBenchmark(host)).toBeNull()
  })
})

describe('auto tier gating', () => {
  it('runs only while qualityAuto is on', () => {
    expect(shouldBenchmark(true, false, '')).toBe(true)
    expect(shouldBenchmark(false, false, '?autotier=1')).toBe(false)
  })

  it('skips automated browsers unless the URL opts in', () => {
    expect(shouldBenchmark(true, true, '')).toBe(false)
    expect(shouldBenchmark(true, true, '?autotier=1')).toBe(true)
    expect(shouldBenchmark(true, true, '?autotier=0')).toBe(false)
  })
})
