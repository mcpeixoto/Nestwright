/**
 * Metered auto-exposure, in EV (stops, log2). Pure: the view meters the HDR frame and feeds
 * the numbers in; nothing here knows about three or the GPU.
 *
 * The sun look still sets a base exposure per time of day (sky and fog are authored against
 * it). Metering adds a correction on top: how many stops the frame's average log-luminance
 * sits below or above middle grey at the base exposure, clamped to a range that depends on
 * where the camera is. Outdoors the range is narrow, so exteriors keep the tuned look;
 * inside a room it opens upwards, the way a camera opens up for an interior and lets the
 * windows burn.
 */

export interface EvRange {
  min: number
  max: number
}

/** Correction range with the camera outside. */
export const OUTDOOR_RANGE: EvRange = { min: -0.3, max: 0.3 }
/**
 * Correction range with the camera inside a room by day. The lift is small on purpose:
 * archviz interiors read real through contrast (sun patches, falloff into the corners), and
 * a meter that opens a room up to grey washes that out.
 */
export const INDOOR_RANGE: EvRange = { min: -0.75, max: 0.6 }
/**
 * Highest indoor correction at night. A lamp-lit room metered to grey reads as daytime; a
 * camera at night is let open up only a little, so the room stays a night room.
 */
export const INDOOR_NIGHT_MAX = 0.3
/**
 * Stops added to the metered target inside by day. Zero: with the trimmed meter and the
 * 0.6 EV cap, an interior lands at or a little under metered grey, which keeps the sun
 * patches bright and the corners dark.
 */
export const INDOOR_BIAS = 0
/**
 * Metered log2 luminance + log2(base exposure) that counts as "correctly exposed". Measured
 * on the harness exteriors at their tuned look (front-facade −2.6 and terrace-pool −2.5 at
 * the day base of 1.05), so exteriors meter near 0 EV correction.
 */
export const METER_KEY_LOG2 = -2.45
/** Seconds to close 63 % of the gap when the exposure has to rise (scene got darker). */
export const ADAPT_UP_S = 1
/** Seconds to close 63 % of the gap when the exposure has to fall (scene got brighter). */
export const ADAPT_DOWN_S = 2.5
/** Manual compensation limits (Settings and photo mode). */
export const EV_COMP_MIN = -2
export const EV_COMP_MAX = 2
/** Log2 luminance floor and ceiling for one meter sample (black sky pixels, the sun disc). */
const SAMPLE_MIN = -14
const SAMPLE_MAX = 10

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function clampEvComp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return clamp(value, EV_COMP_MIN, EV_COMP_MAX)
}

/** Share of the metered weight dropped at each end (darkest and brightest samples). */
export const METER_TRIM = 0.05

/**
 * Centre-weighted, trimmed mean of per-pixel log2 luminance from the meter target
 * (row-major, `stride` floats per texel, log2 luminance in the first). The centre counts ~3×
 * the corners, like a camera's centre-weighted meter, and the darkest and brightest
 * METER_TRIM of the weight are dropped, so a black sculpture or a sunlit floor patch cannot
 * drive the exposure. Null when nothing finite was read.
 */
export function meterAverage(data: ArrayLike<number>, width: number, height: number, stride = 4, trim = METER_TRIM): number | null {
  if (width < 1 || height < 1) return null
  const samples: { v: number; w: number }[] = []
  let total = 0
  for (let y = 0; y < height; y++) {
    const ny = ((y + 0.5) / height) * 2 - 1
    for (let x = 0; x < width; x++) {
      const value = data[(y * width + x) * stride]
      if (value === undefined || !Number.isFinite(value)) continue
      const nx = ((x + 0.5) / width) * 2 - 1
      const w = 1 + 2 * Math.max(0, 1 - (nx * nx + ny * ny) / 1.2)
      samples.push({ v: clamp(value, SAMPLE_MIN, SAMPLE_MAX), w })
      total += w
    }
  }
  if (total <= 0) return null
  samples.sort((a, b) => a.v - b.v)
  const cut = clamp(trim, 0, 0.45) * total
  const lo = cut
  const hi = total - cut
  let sum = 0
  let weight = 0
  let at = 0
  for (const s of samples) {
    // The part of this sample's weight that falls inside [lo, hi] of the cumulative weight.
    const start = Math.max(at, lo)
    const end = Math.min(at + s.w, hi)
    if (end > start) {
      sum += s.v * (end - start)
      weight += end - start
    }
    at += s.w
  }
  return weight > 0 ? sum / weight : null
}

function unit(value: number, fallback: number): number {
  return clamp(Number.isFinite(value) ? value : fallback, 0, 1)
}

/**
 * The correction range for this scene: outdoor and indoor ranges blended by `indoor` (0
 * outside … 1 in a room), the indoor ceiling lowered towards INDOOR_NIGHT_MAX as `daylight`
 * (the sun look's 0 night … 1 day) falls.
 */
export function evRange(indoor: number, daylight = 1): EvRange {
  const t = unit(indoor, 0)
  const day = unit(daylight, 1)
  const indoorMax = INDOOR_NIGHT_MAX + (INDOOR_RANGE.max - INDOOR_NIGHT_MAX) * day
  return {
    min: OUTDOOR_RANGE.min + (INDOOR_RANGE.min - OUTDOOR_RANGE.min) * t,
    max: OUTDOOR_RANGE.max + (indoorMax - OUTDOOR_RANGE.max) * t,
  }
}

/**
 * The EV correction a frame asks for: stops from its metered average (scene log2 luminance,
 * before exposure) at `baseExposure` to the key, plus the daytime indoor bias, clamped to
 * the scene's range.
 */
export function targetEv(meterLog2: number, baseExposure: number, indoor: number, daylight = 1): number {
  const range = evRange(indoor, daylight)
  if (!Number.isFinite(meterLog2) || !(baseExposure > 0)) return 0
  const bias = INDOOR_BIAS * unit(indoor, 0) * unit(daylight, 1)
  const raw = METER_KEY_LOG2 - meterLog2 - Math.log2(baseExposure) + bias
  return clamp(raw, range.min, range.max)
}

/**
 * One adaptation step from `current` towards `target` over `dt` seconds: exponential, with
 * the rise and fall time constants above. `speed` > 1 shortens both (the harness uses it to
 * settle before a capture).
 */
export function adaptEv(current: number, target: number, dt: number, speed = 1): number {
  if (!Number.isFinite(current)) return Number.isFinite(target) ? target : 0
  if (!Number.isFinite(target) || !(dt > 0)) return current
  const tau = (target > current ? ADAPT_UP_S : ADAPT_DOWN_S) / Math.max(1e-3, speed)
  const k = 1 - Math.exp(-dt / tau)
  return current + (target - current) * k
}

/** "+0.5 EV", "0 EV", "−1.2 EV" (one decimal, true minus sign). */
export function formatEv(ev: number): string {
  const value = Math.round((Number.isFinite(ev) ? ev : 0) * 10) / 10
  if (value === 0) return '0 EV'
  const text = Math.abs(value).toFixed(1).replace(/\.0$/, '')
  return `${value > 0 ? '+' : '−'}${text} EV`
}

/** Exposure multiplier for an EV correction plus manual compensation. */
export function evGain(ev: number, compensation = 0): number {
  const total = (Number.isFinite(ev) ? ev : 0) + clampEvComp(compensation)
  return Math.pow(2, total)
}
