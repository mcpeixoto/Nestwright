/** Rolling frame times. `push` does not allocate. `p` for `percentile` is 0–100. */

const DEFAULT_CAPACITY = 300

export interface PerfStats {
  push(dtMs: number): void
  /** Frames per second over the newest samples that cover one second. */
  fps(): number
  percentile(p: number): number
  max(): number
  /** Samples in the window longer than `ms`. */
  countAbove(ms: number): number
  count(): number
  reset(): void
}

export interface CaptureTiming {
  fpsAvg: number
  p50: number
  p95: number
  max: number
  /** Frames longer than HITCH_MS. */
  hitches: number
}

/** A frame this long is a visible stall (three dropped frames at 60 Hz). */
export const HITCH_MS = 50

/**
 * Decides when a scene has settled enough to measure: `quietFrames` frames in a row with no
 * new GPU program and no precompile running. Gives up waiting after `maxFrames` so a scene
 * that keeps compiling still gets a report (its `settled` is then false).
 */
export interface SettleTracker {
  /** One rendered frame. True once settled (and from then on). */
  push(programs: number, busy: boolean): boolean
  settled(): boolean
  /** Frames seen before settling. */
  waited(): number
}

export function createSettleTracker(quietFrames: number, maxFrames = 600): SettleTracker {
  const need = Math.max(0, Math.floor(quietFrames))
  const cap = Math.max(need, Math.floor(maxFrames))
  let quiet = 0
  let seen = 0
  let last = Number.NaN
  let done = need === 0
  let gaveUp = false
  return {
    push(programs, busy) {
      if (done || gaveUp) return true
      seen += 1
      if (busy || programs !== last) quiet = 0
      else quiet += 1
      last = programs
      if (quiet >= need) done = true
      else if (seen >= cap) gaveUp = true
      return done || gaveUp
    },
    settled() {
      return done
    },
    waited() {
      return seen
    },
  }
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
    countAbove(ms) {
      let n = 0
      for (let i = 0; i < count; i++) if ((samples[i] ?? 0) > ms) n += 1
      return n
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
      let hitches = 0
      for (let i = 0; i < count; i++) {
        const dt = samples[i] ?? 0
        sum += dt
        if (dt > peak) peak = dt
        if (dt > HITCH_MS) hitches += 1
      }
      return {
        fpsAvg: sum > 0 ? (count * 1000) / sum : 0,
        p50: percentileFrom(samples, count, scratch, 50),
        p95: percentileFrom(samples, count, scratch, 95),
        max: peak,
        hitches,
      }
    },
  }
}
