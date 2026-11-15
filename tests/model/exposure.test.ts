import { describe, expect, it } from 'vitest'
import {
  adaptEv,
  ADAPT_DOWN_S,
  ADAPT_UP_S,
  clampEvComp,
  evGain,
  evRange,
  formatEv,
  INDOOR_NIGHT_MAX,
  INDOOR_RANGE,
  meterAverage,
  METER_KEY_LOG2,
  OUTDOOR_RANGE,
  targetEv,
} from '../../src/model/exposure'

function flat(width: number, height: number, value: number, stride = 4): Float32Array {
  const data = new Float32Array(width * height * stride)
  for (let i = 0; i < width * height; i++) data[i * stride] = value
  return data
}

describe('meterAverage', () => {
  it('averages log luminance from the first channel of each texel', () => {
    expect(meterAverage(flat(8, 6, -3), 8, 6)).toBeCloseTo(-3, 9)
    expect(meterAverage(flat(8, 6, 2, 1), 8, 6, 1)).toBeCloseTo(2, 9)
  })

  it('weights the centre above the corners and skips non-finite texels', () => {
    const data = flat(9, 9, -6)
    data[(4 * 9 + 4) * 4] = 6
    const centre = meterAverage(data, 9, 9) ?? 0
    const corner = flat(9, 9, -6)
    corner[0] = 6
    expect(centre).toBeGreaterThan(meterAverage(corner, 9, 9) ?? 0)
    const holes = flat(4, 4, -1)
    holes[0] = Number.NaN
    holes[4] = Number.POSITIVE_INFINITY
    expect(meterAverage(holes, 4, 4)).toBeCloseTo(-1, 9)
    expect(meterAverage(flat(2, 2, Number.NaN), 2, 2)).toBeNull()
    expect(meterAverage([], 0, 0)).toBeNull()
  })

  it('clamps extreme samples so the sun disc cannot swing the frame', () => {
    const data = flat(10, 10, -2)
    data[0] = 1e6
    expect(meterAverage(data, 10, 10)).toBeLessThan(-1.5)
  })
})

describe('targetEv', () => {
  it('meters an exterior at the key to no correction', () => {
    expect(targetEv(METER_KEY_LOG2, 1, 0)).toBeCloseTo(0, 9)
  })

  it('keeps exteriors inside the narrow outdoor range', () => {
    expect(targetEv(-10, 1, 0)).toBe(OUTDOOR_RANGE.max)
    expect(targetEv(5, 1, 0)).toBe(OUTDOOR_RANGE.min)
  })

  it('opens up a dark interior by day, but less at night', () => {
    const day = targetEv(-6, 1, 1, 1)
    const night = targetEv(-6, 1, 1, 0)
    expect(day).toBe(INDOOR_RANGE.max)
    expect(night).toBe(INDOOR_NIGHT_MAX)
    expect(day).toBeGreaterThan(night)
  })

  it('biases a daytime interior above metered grey', () => {
    expect(targetEv(METER_KEY_LOG2, 1, 1, 1)).toBeGreaterThan(0)
    expect(targetEv(METER_KEY_LOG2, 1, 1, 0)).toBeCloseTo(0, 9)
  })

  it('accounts for the base exposure already applied', () => {
    expect(targetEv(METER_KEY_LOG2 - 0.2, 0.5, 0)).toBeCloseTo(OUTDOOR_RANGE.max, 9)
    expect(targetEv(METER_KEY_LOG2 + 1, 2, 1, 0)).toBeLessThan(0)
  })

  it('is 0 for unusable input', () => {
    expect(targetEv(Number.NaN, 1, 1)).toBe(0)
    expect(targetEv(-3, 0, 1)).toBe(0)
  })

  it('blends ranges continuously between outdoor and indoor', () => {
    const half = evRange(0.5)
    expect(half.max).toBeGreaterThan(OUTDOOR_RANGE.max)
    expect(half.max).toBeLessThan(INDOOR_RANGE.max)
    expect(evRange(2)).toEqual(evRange(1))
    expect(evRange(Number.NaN)).toEqual(evRange(0))
  })
})

describe('adaptEv', () => {
  it('rises with the up time constant and falls with the slower down one', () => {
    const up = adaptEv(0, 1, ADAPT_UP_S)
    const down = adaptEv(1, 0, ADAPT_UP_S)
    expect(up).toBeCloseTo(1 - Math.exp(-1), 9)
    expect(1 - down).toBeCloseTo(1 - Math.exp(-ADAPT_UP_S / ADAPT_DOWN_S), 9)
    expect(up).toBeGreaterThan(1 - down)
  })

  it('converges without overshoot, frame by frame', () => {
    let ev = -1
    for (let i = 0; i < 600; i++) {
      const next = adaptEv(ev, 2, 1 / 60)
      expect(next).toBeGreaterThanOrEqual(ev)
      expect(next).toBeLessThanOrEqual(2)
      ev = next
    }
    expect(ev).toBeCloseTo(2, 3)
  })

  it('settles faster with a speed factor, and ignores bad steps', () => {
    expect(Math.abs(adaptEv(0, 1, 0.1, 8) - 1)).toBeLessThan(Math.abs(adaptEv(0, 1, 0.1) - 1))
    expect(adaptEv(0.5, 1, 0)).toBe(0.5)
    expect(adaptEv(0.5, Number.NaN, 1)).toBe(0.5)
    expect(adaptEv(Number.NaN, 1, 1)).toBe(1)
  })
})

describe('compensation', () => {
  it('turns EV into a gain and clamps compensation to ±2', () => {
    expect(evGain(0)).toBe(1)
    expect(evGain(1)).toBe(2)
    expect(evGain(0, -1)).toBe(0.5)
    expect(evGain(0, 9)).toBe(4)
    expect(clampEvComp(-5)).toBe(-2)
    expect(clampEvComp(Number.NaN)).toBe(0)
  })

  it('formats EV with a sign', () => {
    expect(formatEv(0)).toBe('0 EV')
    expect(formatEv(0.5)).toBe('+0.5 EV')
    expect(formatEv(-1.24)).toBe('−1.2 EV')
    expect(formatEv(2)).toBe('+2 EV')
  })
})
