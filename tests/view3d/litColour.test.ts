/**
 * Lit colours at 12:00 on a clear summer day, from the light model alone: sun, hemisphere and
 * environment fill, the look exposure and auto-exposure, AgX, sRGB. No GPU. The windows are
 * the albedo comments' targets (library.ts roof-tiles, terrain/textures.ts LAWN_ALBEDO) and
 * the interior target of the realism plan (daylit plaster ≥ 165).
 *
 * The model is three's diffuse shading: sun albedo/π · E · n·l, hemisphere albedo/π ·
 * mix(ground, sky, ½n·y + ½) · I, environment albedo · (cosine-weighted dome radiance) ·
 * ENV_INTENSITY. It leaves out specular, grass blades and GTAO, which the harness renders add
 * on top (the noon lawn renders ~5 sRGB bluer than this).
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getMaterialDef } from '../../src/materials/library'
import { METER_KEY_LOG2, evGain, targetEv } from '../../src/model/exposure'
import { sunDirection, sunLook } from '../../src/model/sunLook'
import { ENV_INTENSITY, skyParams } from '../../src/view3d/atmosphere/skyParams'
import { toneMap } from '../../src/view3d/atmosphere/toneMap'
import { LAWN_ALBEDO } from '../../src/view3d/terrain/textures'

type RGB = [number, number, number]

const DAY = 172
const LATITUDE = 41.15
const NOON = 12
/** Mean of the roof-tiles scan's AO channel (content pack roof-tiles-tex meanOrm[0]); it dims the fill only. */
const ROOF_SCAN_AO = 0.784
/**
 * The harness living room (scripts/visual views.json "living-room", 15:30) after this change:
 * the frame meters −4.51 (log2 scene luminance) and its two plaster walls sit +0.52 and +0.75
 * stops above that (rendered L 161 and 168). Measured 2026-11-16; the room's light comes from
 * the probes, not from this model, so only the exposure side is tested here.
 */
const LIVING_METER_LOG2 = -4.51
const LIVING_WALL_OVER_METER = 0.64
const LIVING_TIME = 15.5

const srgbByteToLinear = (b: number) => {
  const c = b / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const linearToSrgbByte = (v: number) => {
  const c = Math.min(1, Math.max(0, v))
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
}
const hexLinear = (hex: string): RGB => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
const luma = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Cosine-weighted mean radiance of the env dome (gradeSky: horizon below, graded to the zenith above). */
function domeIrradiance(n: THREE.Vector3, zenith: readonly number[], horizon: readonly number[]): RGB {
  const sum: RGB = [0, 0, 0]
  let weight = 0
  const d = new THREE.Vector3()
  for (let i = 0; i < 64; i++) {
    const y = -1 + (2 * (i + 0.5)) / 64
    const r = Math.sqrt(1 - y * y)
    for (let j = 0; j < 128; j++) {
      const phi = (2 * Math.PI * (j + 0.5)) / 128
      d.set(r * Math.cos(phi), y, r * Math.sin(phi))
      const cos = d.dot(n)
      if (cos <= 0) continue
      const t = smooth(0, 0.62, Math.max(0, y))
      for (let k = 0; k < 3; k++) sum[k] += cos * (horizon[k]! + (zenith[k]! - horizon[k]!) * t)
      weight += cos
    }
  }
  return [sum[0] / weight, sum[1] / weight, sum[2] / weight]
}

function sunAt(time: number) {
  const v = sunDirection(DAY, time, LATITUDE, 0)
  const dir = new THREE.Vector3(v.x, v.y, v.z).normalize()
  const look = sunLook(Math.asin(dir.y))
  return { dir, look }
}

/** Linear scene radiance of a matt surface with normal `n` at `time`, clear sky. */
function radiance(albedo: RGB, n: THREE.Vector3, time: number, fillAo = 1): RGB {
  const { dir, look } = sunAt(time)
  const sky = skyParams(Math.asin(dir.y), 'clear', 0, look.exposure)
  const ndl = Math.max(0, n.dot(dir))
  const sun: RGB = [look.r, look.g, look.b]
  const hemiSky = hexLinear(sky.hemiSky)
  const hemiGround = hexLinear(sky.hemiGround)
  const w = 0.5 * n.y + 0.5
  const dome = domeIrradiance(n, sky.zenithLight, sky.horizonLight)
  return [0, 1, 2].map((k) => {
    const direct = (sun[k]! * look.intensity * ndl) / Math.PI
    const hemi = ((hemiGround[k]! + (hemiSky[k]! - hemiGround[k]!) * w) * sky.hemiIntensity) / Math.PI
    const env = dome[k]! * ENV_INTENSITY
    return albedo[k]! * (direct + (hemi + env) * fillAo)
  }) as RGB
}

function displayed(scene: RGB, exposure: number): RGB {
  const m = toneMap(scene, exposure, 'agx')
  return [linearToSrgbByte(m[0]), linearToSrgbByte(m[1]), linearToSrgbByte(m[2])]
}

function within(rgb: RGB, lo: RGB, hi: RGB): boolean {
  return rgb.every((v, k) => v >= lo[k]! && v <= hi[k]!)
}

const pitch = Math.PI / 6
/** A 30° roof face turned to the noon sun (north is plan +y = world +z, so south is −z). */
const southRoof = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch))
const up = new THREE.Vector3(0, 1, 0)
const roofAlbedo = hexLinear(getMaterialDef('roof-tiles')!.color)
/** Mean of the lawn texel: LAWN_ALBEDO plus the baked noise's average lift (~+6, +5, +4). */
const lawnAlbedo: RGB = [srgbByteToLinear(LAWN_ALBEDO.r + 6), srgbByteToLinear(LAWN_ALBEDO.g + 5), srgbByteToLinear(LAWN_ALBEDO.b + 4)]
const plasterAlbedo = hexLinear(getMaterialDef('plaster-white')!.color)

describe('lit colour at 12:00, clear', () => {
  const { look } = sunAt(NOON)
  // The harness exteriors settle between 0 and +0.2 EV around noon (aerial-cutaway +0.19).
  for (const ev of [0, 0.2]) {
    const exposure = look.exposure * Math.pow(2, ev)

    it(`reads the sunlit roof as terracotta at ${ev} EV`, () => {
      const roof = displayed(radiance(roofAlbedo, southRoof, NOON, ROOF_SCAN_AO), exposure)
      expect(within(roof, [150, 70, 50], [185, 100, 75]), `roof ${roof}`).toBe(true)
    })

    it(`reads the sunlit lawn as green, not hazy, at ${ev} EV`, () => {
      const lawn = displayed(radiance(lawnAlbedo, up, NOON), exposure)
      expect(within(lawn, [70, 105, 45], [105, 145, 75]), `lawn ${lawn}`).toBe(true)
    })
  }

  it('keeps the sky a small share of the noon light on open ground', () => {
    const lit = radiance([1, 1, 1], up, NOON)
    const { dir } = sunAt(NOON)
    const direct = (look.g * look.intensity * Math.max(0, up.dot(dir))) / Math.PI
    // Clear-day sky light is ~15–25 % of global horizontal illuminance.
    expect(1 - direct / lit[1]).toBeLessThan(0.3)
  })

  it('lets a daylit room meter up until its plaster walls read light', () => {
    const { look: afternoon } = sunAt(LIVING_TIME)
    const ev = targetEv(LIVING_METER_LOG2, afternoon.exposure, 1, afternoon.daylight, afternoon.climb)
    const exposure = afternoon.exposure * evGain(ev)
    const wallLuma = Math.pow(2, LIVING_METER_LOG2 + LIVING_WALL_OVER_METER)
    const wall = displayed(plasterAlbedo.map((a) => (a * wallLuma) / luma(plasterAlbedo)) as RGB, exposure)
    expect(luma(wall), `wall ${wall} at ${ev.toFixed(2)} EV`).toBeGreaterThanOrEqual(165)
    // …and does not burn it: the room still sits within a stop of metered grey.
    expect(ev + LIVING_METER_LOG2 + Math.log2(afternoon.exposure) - METER_KEY_LOG2).toBeLessThan(1)
  })
})
