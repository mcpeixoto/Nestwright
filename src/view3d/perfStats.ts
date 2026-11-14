/** Rolling frame times. `push` does not allocate. `p` for `percentile` is 0–100. */

const DEFAULT_CAPACITY = 300

export interface PerfStats {
  push(dtMs: number): void
  /** Frames per second over the newest samples that cover one second. */
  fps(): number
  percentile(p: number): number
  max(): number
  count(): number
  reset(): void
}

export interface CaptureTiming {
  fpsAvg: number
  p50: number
  p95: number
  max: number
}

export interface FrameCapture {
  start(frames: number): void
  /** Store one rendered frame. True when the requested count has just been reached. */
  push(dtMs: number): boolean
  timing(): CaptureTiming
}

function percentileFrom(samples: Float64Array, count: number, scratch: Float64Array, p: number): number {
  if (count <= 0) return 0
  for (let i = 0; i < count; i++) scratch[i] = samples[i] ?? 0
  for (let i = 1; i < count; i++) {
    const value = scratch[i] ?? 0
    let j = i - 1
    while (j >= 0 && (scratch[j] ?? 0) > value) {
      scratch[j + 1] = scratch[j] ?? 0
      j -= 1
    }
    scratch[j + 1] = value
  }
  if (count === 1) return scratch[0] ?? 0
  const clamped = Math.min(100, Math.max(0, p))
  const rank = (clamped / 100) * (count - 1)
  const lo = Math.floor(rank)
  const hi = Math.min(count - 1, Math.ceil(rank))
  const t = rank - lo
  return (scratch[lo] ?? 0) * (1 - t) + (scratch[hi] ?? 0) * t
}

export function createPerfStats(capacity = DEFAULT_CAPACITY): PerfStats {
  const size = Math.max(1, Math.floor(capacity))
  const samples = new Float64Array(size)
  const scratch = new Float64Array(size)
  let head = 0
  let count = 0

  function newest(age: number): number {
    const idx = (head - 1 - age) % size
    return samples[idx < 0 ? idx + size : idx] ?? 0
  }

  return {
    push(dtMs) {
      if (!Number.isFinite(dtMs) || dtMs < 0) return
      samples[head] = dtMs
      head = (head + 1) % size
      if (count < size) count += 1
    },
    fps() {
      if (count === 0) return 0
      let sum = 0
      let frames = 0
      for (let age = 0; age < count; age++) {
        const dt = newest(age)
        if (frames > 0 && sum >= 1000) break
        sum += dt
        frames += 1
        if (sum >= 1000) break
      }
      if (sum <= 0 || frames === 0) return 0
      return (frames * 1000) / sum
    },
    percentile(p) {
      return percentileFrom(samples, count, scratch, p)
    },
    max() {
      let peak = 0
      for (let i = 0; i < count; i++) {
        const dt = samples[i] ?? 0
        if (dt > peak) peak = dt
      }
      return peak
    },
    count() {
      return count
    },
    reset() {
      head = 0
      count = 0
    },
  }
}

/** HUD ring: p50/p95 over the last 300 frames, fps over one second. */
export const frameStats = createPerfStats(DEFAULT_CAPACITY)

const CAPTURE_MAX = 4096

export function createFrameCapture(limit = CAPTURE_MAX): FrameCapture {
  const size = Math.max(1, Math.floor(limit))
  const samples = new Float64Array(size)
  const scratch = new Float64Array(size)
  let count = 0
  let target = 0
  let active = false

  return {
    start(frames) {
      const requested = Number.isFinite(frames) ? Math.floor(frames) : 1
      target = Math.max(1, Math.min(size, requested))
      count = 0
      active = true
    },
    push(dtMs) {
      if (!active || !Number.isFinite(dtMs) || dtMs < 0) return false
      if (count < target) {
        samples[count] = dtMs
        count += 1
      }
      if (count >= target) {
        active = false
        return true
      }
      return false
    },
    timing() {
      let sum = 0
      let peak = 0
      for (let i = 0; i < count; i++) {
        const dt = samples[i] ?? 0
        sum += dt
        if (dt > peak) peak = dt
      }
      return {
        fpsAvg: sum > 0 ? (count * 1000) / sum : 0,
        p50: percentileFrom(samples, count, scratch, 50),
        p95: percentileFrom(samples, count, scratch, 95),
        max: peak,
      }
    },
  }
}
