import type { GraphicsQuality } from '../../settings'

/**
 * First-launch tier pick. The benchmark renders the live scene on the Medium profile and
 * times each frame to GPU completion, not to the next vsync, so a fast machine is not read
 * as "16.7 ms" just because the display runs at 60 Hz.
 *
 * Budgets are for a Medium frame. Ultra renders about 2.2× the pixels of Medium (scale 1.0
 * against 0.67) and adds SSGI, so it needs a Medium frame well under 8 ms; High (1.4× the
 * pixels, adds SSR) needs one under 11 ms; Medium itself must fit the 16.7 ms of 60 fps.
 */
export const TIER_BUDGETS_MS = {
  ultra: 5,
  high: 11,
  medium: 16,
} as const

/** The tier the benchmark runs on. */
export const BENCHMARK_TIER: GraphicsQuality = 'medium'

/** Frames thrown away first: pipeline compiles and texture uploads land in these. */
export const WARMUP_FRAMES = 8
export const BENCHMARK_MS = 2000
export const MIN_FRAMES = 12
export const MAX_FRAMES = 240

export function median(values: readonly number[]): number {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  if (clean.length === 0) return Number.NaN
  const mid = Math.floor(clean.length / 2)
  return clean.length % 2 ? (clean[mid] ?? Number.NaN) : ((clean[mid - 1] ?? 0) + (clean[mid] ?? 0)) / 2
}

/** Highest tier whose budget a Medium frame of `medianMs` fits. Unknown timing picks Medium. */
export function pickTier(medianMs: number): GraphicsQuality {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return 'medium'
  if (medianMs <= TIER_BUDGETS_MS.ultra) return 'ultra'
  if (medianMs <= TIER_BUDGETS_MS.high) return 'high'
  if (medianMs <= TIER_BUDGETS_MS.medium) return 'medium'
  return 'low'
}

/** What the benchmark needs from a 3D view. A fake one drives the tests. */
export interface BenchmarkHost {
  /** Submit one frame at `tier`. */
  render(tier: GraphicsQuality): void
  /** Resolves once the GPU has finished all submitted work. */
  finish(): Promise<void>
  now(): number
  /** False once the view went away or the user took over; the run stops early. */
  alive(): boolean
}

export interface BenchmarkResult {
  tier: GraphicsQuality
  medianMs: number
  frames: number
}

/**
 * Warm up, then time frames for up to `BENCHMARK_MS`. Each sample is one submit plus the wait
 * for the GPU, so frames never overlap and the display refresh does not cap the number.
 * Null when the host died or too few frames were timed to trust.
 */
export async function runBenchmark(host: BenchmarkHost): Promise<BenchmarkResult | null> {
  for (let i = 0; i < WARMUP_FRAMES; i++) {
    if (!host.alive()) return null
    host.render(BENCHMARK_TIER)
    await host.finish()
  }
  const samples: number[] = []
  const start = host.now()
  while (samples.length < MAX_FRAMES && host.now() - start < BENCHMARK_MS) {
    if (!host.alive()) return null
    const t0 = host.now()
    host.render(BENCHMARK_TIER)
    await host.finish()
    samples.push(host.now() - t0)
  }
  if (samples.length < MIN_FRAMES) return null
  const medianMs = median(samples)
  return { tier: pickTier(medianMs), medianMs, frames: samples.length }
}

/** Run only when asked for, and never inside automated browsers unless the URL opts in. */
export function shouldBenchmark(qualityAuto: boolean, webdriver: boolean, search: string): boolean {
  if (!qualityAuto) return false
  if (!webdriver) return true
  try {
    return new URLSearchParams(search).get('autotier') === '1'
  } catch {
    return false
  }
}
