import { describe, expect, it } from 'vitest'
import { evRange, targetEv } from '../../src/model/exposure'
import {
  lampSceneGain,
  pointCandela,
  REF_DAY_LOG2,
  REF_REFLECTANCE,
  roomLampLux,
  roomMeterLog2,
  SCENE_PER_LUX_DAY,
  SCENE_PER_LUX_NIGHT,
  shadeLuminance,
} from '../../src/model/light'
import { sunLook } from '../../src/model/sunLook'

/** The harness living room, roughly: 6.6 × 4.5 m, 2.7 m high. */
const ROOM = { w: 6.6, d: 4.5, h: 2.7 }
/** Pendant, floor lamp, table lamp (catalog defaults). */
const LAMPS = [800, 1200, 450]
const NIGHT = sunLook(-0.6)
const DAY = sunLook(0.7)

describe('lamp scale', () => {
  it('derives its day and night scale from the reference rooms', () => {
    expect(SCENE_PER_LUX_DAY).toBeCloseTo(2.9e-4, 5)
    expect(SCENE_PER_LUX_NIGHT).toBeCloseTo(0.149, 3)
    expect(lampSceneGain(1)).toBeCloseTo(SCENE_PER_LUX_DAY, 12)
    expect(lampSceneGain(0)).toBeCloseTo(SCENE_PER_LUX_NIGHT, 12)
    expect(lampSceneGain(0.5)).toBeCloseTo(Math.sqrt(SCENE_PER_LUX_DAY * SCENE_PER_LUX_NIGHT), 12)
    expect(lampSceneGain(0.3)).toBeGreaterThan(lampSceneGain(0.6))
    expect(lampSceneGain(Number.NaN)).toBe(lampSceneGain(1))
  })

  it('puts an 800 lm pendant 2 m above a table at a small share of daylight', () => {
    const lux = pointCandela(800) / 4
    expect(lux).toBeCloseTo(15.9, 1)
    // By day: under 2 % of the reference room's daylight (1000 lx).
    const dayAmbient = (Math.PI * Math.pow(2, REF_DAY_LOG2)) / REF_REFLECTANCE
    expect((lux * lampSceneGain(1)) / dayAmbient).toBeLessThan(0.02)
    // By night: several times the bare room's ambient (3 lx), so the pool reads.
    expect((lux * lampSceneGain(0)) / (3 * lampSceneGain(0))).toBeGreaterThan(4)
  })

  it('gives a lit shade a luminance a little above a daylit wall', () => {
    expect(shadeLuminance(800)).toBeCloseTo(254.6, 0)
    expect(shadeLuminance(0)).toBe(0)
    expect(shadeLuminance(1600)).toBeCloseTo(2 * shadeLuminance(800), 9)
  })
})

describe('exposure with lamps on', () => {
  it('keeps one to three lamps at night inside the exposure range, darker than the bare room', () => {
    const range = evRange(1, NIGHT.daylight)
    const bare = targetEv(roomMeterLog2(NIGHT.daylight, 0), NIGHT.exposure, 1, NIGHT.daylight)
    let last = bare
    for (let n = 1; n <= LAMPS.length; n++) {
      const meter = roomMeterLog2(NIGHT.daylight, roomLampLux(LAMPS.slice(0, n), ROOM))
      const ev = targetEv(meter, NIGHT.exposure, 1, NIGHT.daylight)
      expect(ev).toBeGreaterThan(range.min)
      expect(ev).toBeLessThanOrEqual(range.max)
      expect(ev).toBeLessThan(last)
      last = ev
    }
  })

  it('barely moves the meter by day', () => {
    const bare = roomMeterLog2(DAY.daylight, 0)
    const lit = roomMeterLog2(DAY.daylight, roomLampLux(LAMPS, ROOM))
    expect(lit - bare).toBeGreaterThan(0)
    expect(lit - bare).toBeLessThan(0.15)
    expect(targetEv(lit, DAY.exposure, 1, DAY.daylight)).toBeCloseTo(targetEv(bare, DAY.exposure, 1, DAY.daylight), 1)
  })

  it('pinned the exposure at its floor with the v0.7.0 factor (8 scene units per candela)', () => {
    const lux = roomLampLux([800], ROOM)
    const ambient = Math.pow(2, roomMeterLog2(NIGHT.daylight, 0))
    const old = Math.log2(ambient + (REF_REFLECTANCE / Math.PI) * lux * 8)
    expect(targetEv(old, NIGHT.exposure, 1, NIGHT.daylight)).toBe(evRange(1, NIGHT.daylight).min)
  })

  it('handles a dark room and no lamps', () => {
    expect(roomLampLux([], ROOM)).toBe(0)
    expect(roomLampLux([800], { w: 0, d: 0, h: 0 })).toBe(0)
    expect(roomLampLux([Number.NaN, -5, 800], ROOM)).toBeCloseTo(roomLampLux([800], ROOM), 9)
  })
})
