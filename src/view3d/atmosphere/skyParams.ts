import { sunLook, TWILIGHT_RAD } from '../../model/sunLook'
import type { ToneMapSetting } from '../../settings'
import { linearToSrgbByte, srgbByteToLinear } from '../colorLinear'
import { acesFilmic, DEFAULT_TONE, toneMap } from './toneMap'

/**
 * Display targets for a clear noon. The tone mapper (AgX by default, ACES as a setting)
 * mixes channels, so a Preetham zenith that is "blue" in linear light comes out
 * cyan/mint. `*Scene` values are the linear radiance to write *before* tone
 * mapping so the framebuffer lands on these sRGB bytes under the active curve. `*Light` is
 * plain sRGB→linear for the environment map (lighting, not a second tone-mapping pass).
 */
export const NOON_ZENITH_SRGB: readonly [number, number, number] = [95, 140, 200]
export const NOON_HORIZON_SRGB: readonly [number, number, number] = [190, 205, 220]
/** Warm orange, horizon brighter than the zenith. Tunable. */
export const SUNSET_ZENITH_SRGB: readonly [number, number, number] = [86, 98, 156]
export const SUNSET_HORIZON_SRGB: readonly [number, number, number] = [236, 132, 72]
export const NIGHT_ZENITH_SRGB: readonly [number, number, number] = [10, 16, 40]
export const NIGHT_HORIZON_SRGB: readonly [number, number, number] = [25, 35, 65]
/**
 * The environment map's lower half: sunlit lawn and paving seen from a wall. Warm and about a
 * quarter of the horizon's brightness, like real ground bounce. Without it every shaded face
 * took the bright blue horizon from below.
 */
export const NOON_GROUND_SRGB: readonly [number, number, number] = [112, 110, 92]
const SUNSET_GROUND_SRGB: readonly [number, number, number] = [84, 70, 56]
const NIGHT_GROUND_SRGB: readonly [number, number, number] = [12, 13, 16]
const OVERCAST_GROUND_SRGB: readonly [number, number, number] = [96, 98, 94]

/** Clear-day scattering. High rayleigh and low mie keep the zenith blue before the grade. */
/**
 * Environment (PMREM sky) fill, scene.environmentIntensity. Every material without its own
 * envMap scales by this, not by its envMapIntensity. High values let a cyan sky tint red
 * roofs lilac.
 */
export const ENV_INTENSITY = 0.7
/**
 * Hemisphere fill by day. With the environment fill it is the whole sky light; at 0.8 it
 * matched the sun on open ground and washed out every shadow.
 */
export const DAY_HEMI_INTENSITY = 0.3

export const CLEAR_TURBIDITY = 2
export const CLEAR_RAYLEIGH = 2.6
export const CLEAR_MIE = 0.0014
export const CLEAR_MIE_G = 0.72

/**
 * Clear-day haze. Linear fog mixes the bright horizon in before tone mapping, so it whitens far
 * faster than the numbers suggest: at 1100 m (≈1 km visibility) woods at 450 m were already 80%
 * haze, and even 14% still beat a dark forest 10:1. Real clear-day inscatter at 450 m is a few
 * percent; the far ridge fades by its own vertex colour instead.
 */
export const CLEAR_FOG_NEAR = 300
export const CLEAR_FOG_FAR = 6000
/** Rain and snow keep the old murk. */
export const WET_FOG_NEAR = 130
export const WET_FOG_FAR = 1100

type RGB = [number, number, number]

export interface SkyParams {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
  /** Look exposure (sunLook × photo). The renderer gets `rendererExposure(exposure, tone)`. */
  exposure: number
  tone: ToneMapSetting
  zenithDisplay: RGB
  horizonDisplay: RGB
  /** Linear radiance that the tone mapper maps back to the display bytes. */
  zenithScene: RGB
  horizonScene: RGB
  /** sRGB→linear, for the PMREM environment (not inverse-ACES). */
  zenithLight: RGB
  horizonLight: RGB
  /** sRGB→linear ground under the environment map (bounce light from below). */
  groundLight: RGB
  fogNear: number
  fogFar: number
  night: number
  sunset: number
  /** 0 hides the sun disc (env map, deep night). */
  sunDisc: number
  star: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  /** Fraction of the sky under cloud and the opacity of a thick cloud (see `cloudLook`). */
  cloudCoverage: number
  cloudDensity: number
  /** Display targets (sRGB bytes) for a sunlit cloud top and a shadowed base. */
  cloudLitDisplay: RGB
  cloudShadeDisplay: RGB
  /** Scene radiance that the tone mapper maps back to the cloud display bytes. */
  cloudLitScene: RGB
  cloudShadeScene: RGB
}

/** Cloud colours on screen. Fair-weather cumulus: near-white tops, cool grey bases. */
export const CLOUD_LIT_SRGB: readonly [number, number, number] = [246, 246, 243]
export const CLOUD_SHADE_SRGB: readonly [number, number, number] = [160, 170, 188]
const CLOUD_SUNSET_LIT: readonly [number, number, number] = [250, 186, 136]
const CLOUD_SUNSET_SHADE: readonly [number, number, number] = [126, 106, 122]
const CLOUD_NIGHT_LIT: readonly [number, number, number] = [72, 80, 98]
const CLOUD_NIGHT_SHADE: readonly [number, number, number] = [30, 34, 46]
const CLOUD_RAIN_LIT: readonly [number, number, number] = [190, 194, 200]
const CLOUD_RAIN_SHADE: readonly [number, number, number] = [108, 114, 124]
const CLOUD_FOG_LIT: readonly [number, number, number] = [214, 217, 221]
const CLOUD_FOG_SHADE: readonly [number, number, number] = [168, 173, 180]

/**
 * How much cloud the sky shows for a weather and the cloudiness slider. A clear day at the default
 * 0.15 still carries scattered cumulus; an empty sky read as computer-made.
 */
export function cloudLook(weather: string, cloudiness: number): { coverage: number; density: number } {
  const c = clamp01(Number.isFinite(cloudiness) ? cloudiness : 0)
  if (weather === 'fog') return { coverage: 0.85, density: 0.4 }
  if (weather === 'rain' || weather === 'snow') return { coverage: Math.min(1, 0.86 + c * 0.12), density: 0.97 }
  return { coverage: 0.24 + c * 0.55, density: 0.88 + c * 0.1 }
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1))
  return t * t * (3 - 2 * t)
}

function mix3(a: readonly [number, number, number], b: readonly [number, number, number], t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export { acesFilmic }

/** sRGB bytes on screen for scene radiance at a look exposure, under the chosen tone mapper. */
export function displayedSrgb(scene: readonly [number, number, number], exposure: number, tone: ToneMapSetting = DEFAULT_TONE): RGB {
  const mapped = toneMap(scene, exposure, tone)
  return [linearToSrgbByte(mapped[0]), linearToSrgbByte(mapped[1]), linearToSrgbByte(mapped[2])]
}

function srgbToLinear3(rgb: readonly [number, number, number]): RGB {
  return [srgbByteToLinear(rgb[0]), srgbByteToLinear(rgb[1]), srgbByteToLinear(rgb[2])]
}

const jac = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
]
const probe = [0, 0, 0] as RGB

/** Scene radiance whose tone-mapped output is `target` (already linear, post-curve). Mutates `out`. */
function invertTone(target: RGB, exposure: number, tone: ToneMapSetting, out: RGB): void {
  const curve = (c: RGB) => toneMap(c, exposure, tone)
  out[0] = target[0]
  out[1] = target[1]
  out[2] = target[2]
  const eps = 1e-3
  for (let iter = 0; iter < 10; iter++) {
    const y = curve(out)
    const err0 = target[0] - y[0]
    const err1 = target[1] - y[1]
    const err2 = target[2] - y[2]
    if (Math.abs(err0) + Math.abs(err1) + Math.abs(err2) < 2e-4) return
    for (let col = 0; col < 3; col++) {
      probe[0] = out[0]
      probe[1] = out[1]
      probe[2] = out[2]
      probe[col] += eps
      const y2 = curve(probe)
      jac[0]![col] = (y2[0] - y[0]) / eps
      jac[1]![col] = (y2[1] - y[1]) / eps
      jac[2]![col] = (y2[2] - y[2]) / eps
    }
    const a = jac[0]![0]
    const b = jac[0]![1]
    const c = jac[0]![2]
    const d = jac[1]![0]
    const e = jac[1]![1]
    const f = jac[1]![2]
    const g = jac[2]![0]
    const h = jac[2]![1]
    const i = jac[2]![2]
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if (Math.abs(det) < 1e-8) return
    const dx = (err0 * (e * i - f * h) - b * (err1 * i - f * err2) + c * (err1 * h - e * err2)) / det
    const dy = (a * (err1 * i - f * err2) - err0 * (d * i - f * g) + c * (d * err2 - err1 * g)) / det
    const dz = (a * (e * err2 - err1 * h) - b * (d * err2 - err1 * g) + err0 * (d * h - e * g)) / det
    out[0] = Math.max(0, out[0] + dx)
    out[1] = Math.max(0, out[1] + dy)
    out[2] = Math.max(0, out[2] + dz)
  }
}

function lighten(rgb: RGB, toward: readonly [number, number, number], t: number): RGB {
  return mix3(rgb, toward, t)
}

export function createSkyParams(): SkyParams {
  const zero: RGB = [0, 0, 0]
  return {
    turbidity: CLEAR_TURBIDITY,
    rayleigh: CLEAR_RAYLEIGH,
    mieCoefficient: CLEAR_MIE,
    mieDirectionalG: CLEAR_MIE_G,
    exposure: 0.5,
    tone: DEFAULT_TONE,
    zenithDisplay: [0, 0, 0],
    horizonDisplay: [0, 0, 0],
    zenithScene: [...zero],
    horizonScene: [...zero],
    zenithLight: [...zero],
    horizonLight: [...zero],
    groundLight: [...zero],
    fogNear: CLEAR_FOG_NEAR,
    fogFar: CLEAR_FOG_FAR,
    night: 0,
    sunset: 0,
    sunDisc: 1,
    star: 0,
    hemiSky: '#b7cbe4',
    hemiGround: '#4e5a3c',
    hemiIntensity: 0.45,
    cloudCoverage: 0,
    cloudDensity: 0,
    cloudLitDisplay: [0, 0, 0],
    cloudShadeDisplay: [0, 0, 0],
    cloudLitScene: [...zero],
    cloudShadeScene: [...zero],
  }
}

function writeCloudColours(out: SkyParams, weather: string, cover: number, exp: number, tone: ToneMapSetting): void {
  const look = cloudLook(weather, cover)
  out.cloudCoverage = look.coverage
  out.cloudDensity = look.density
  const day = 1 - out.night
  const grey = weather === 'fog' ? 1 : weather === 'rain' || weather === 'snow' ? 1 : cover * 0.35
  const greyLit = weather === 'fog' ? CLOUD_FOG_LIT : CLOUD_RAIN_LIT
  const greyShade = weather === 'fog' ? CLOUD_FOG_SHADE : CLOUD_RAIN_SHADE
  let lit = mix3(CLOUD_LIT_SRGB, CLOUD_SUNSET_LIT, out.sunset)
  let shade = mix3(CLOUD_SHADE_SRGB, CLOUD_SUNSET_SHADE, out.sunset)
  lit = mix3(lit, greyLit, grey * day)
  shade = mix3(shade, greyShade, grey * day)
  lit = mix3(lit, CLOUD_NIGHT_LIT, out.night)
  shade = mix3(shade, CLOUD_NIGHT_SHADE, out.night)
  out.cloudLitDisplay = lit
  out.cloudShadeDisplay = shade
  invertTone(srgbToLinear3(lit), exp, tone, out.cloudLitScene)
  invertTone(srgbToLinear3(shade), exp, tone, out.cloudShadeScene)
}

const sceneZenith: RGB = [0, 0, 0]
const sceneHorizon: RGB = [0, 0, 0]

/** Fill `out`. Safe to call when the sun, weather, or exposure changes — not every frame. */
export function writeSkyParams(
  sunAltitude: number,
  weather: string,
  cloudiness: number,
  exposure: number,
  out: SkyParams,
  tone: ToneMapSetting = DEFAULT_TONE,
): SkyParams {
  const alt = Number.isFinite(sunAltitude) ? sunAltitude : 0.6
  const cover = clamp01(Number.isFinite(cloudiness) ? cloudiness : 0)
  const exp = Number.isFinite(exposure) && exposure > 0 ? exposure : sunLook(alt).exposure
  // Full night starts only after civil twilight (−6°). Blue hour keeps a warm horizon.
  const night = smoothstep(-TWILIGHT_RAD, 0.3, -alt)
  const sunset = smoothstep(-0.2, -0.02, alt) * (1 - smoothstep(0.06, 0.45, alt)) * (1 - night)
  const day = 1 - night
  const grey: RGB = [198, 206, 214]
  let zenith = mix3(NOON_ZENITH_SRGB, SUNSET_ZENITH_SRGB, sunset)
  zenith = mix3(zenith, NIGHT_ZENITH_SRGB, night)
  let horizon = mix3(NOON_HORIZON_SRGB, SUNSET_HORIZON_SRGB, sunset)
  horizon = mix3(horizon, NIGHT_HORIZON_SRGB, night)
  const overcast = weather === 'fog' ? 0.72 : weather === 'rain' || weather === 'snow' ? 0.45 : cover * 0.28
  zenith = lighten(zenith, weather === 'snow' ? [214, 220, 226] : grey, overcast * day)
  horizon = lighten(horizon, weather === 'snow' ? [226, 230, 234] : grey, overcast * 0.65 * day)
  const clear = weather === 'clear'
  out.turbidity = clear ? CLEAR_TURBIDITY + cover * 2.2 : weather === 'fog' ? 9 : 5.5 + cover * 2
  out.rayleigh = clear ? CLEAR_RAYLEIGH - cover * 0.4 : weather === 'fog' ? 0.45 : 0.9
  out.mieCoefficient = clear ? CLEAR_MIE + cover * 0.001 : 0.006
  out.mieDirectionalG = CLEAR_MIE_G
  out.exposure = exp
  out.zenithDisplay = zenith
  out.horizonDisplay = horizon
  const zenithTarget = srgbToLinear3(zenith)
  const horizonTarget = srgbToLinear3(horizon)
  out.tone = tone
  invertTone(zenithTarget, exp, tone, sceneZenith)
  invertTone(horizonTarget, exp, tone, sceneHorizon)
  out.zenithScene[0] = sceneZenith[0]
  out.zenithScene[1] = sceneZenith[1]
  out.zenithScene[2] = sceneZenith[2]
  out.horizonScene[0] = sceneHorizon[0]
  out.horizonScene[1] = sceneHorizon[1]
  out.horizonScene[2] = sceneHorizon[2]
  const zenithLight = srgbToLinear3(zenith)
  const horizonLight = srgbToLinear3(horizon)
  out.zenithLight[0] = zenithLight[0]
  out.zenithLight[1] = zenithLight[1]
  out.zenithLight[2] = zenithLight[2]
  out.horizonLight[0] = horizonLight[0]
  out.horizonLight[1] = horizonLight[1]
  out.horizonLight[2] = horizonLight[2]
  let ground = mix3(NOON_GROUND_SRGB, SUNSET_GROUND_SRGB, sunset)
  ground = mix3(ground, OVERCAST_GROUND_SRGB, (clear ? 0 : 1) * day)
  ground = mix3(ground, NIGHT_GROUND_SRGB, night)
  const groundLight = srgbToLinear3(ground)
  out.groundLight[0] = groundLight[0]
  out.groundLight[1] = groundLight[1]
  out.groundLight[2] = groundLight[2]
  out.night = night
  out.sunset = sunset
  out.sunDisc = night > 0.85 ? 0 : 1
  out.star = night * (1 - cover * 0.65) * (weather === 'fog' ? 0.15 : 1)
  out.fogNear = weather === 'fog' ? 22 : night > 0.6 ? 80 : clear ? CLEAR_FOG_NEAR : WET_FOG_NEAR
  out.fogFar = weather === 'fog' ? 150 : night > 0.6 ? 1000 : clear ? CLEAR_FOG_FAR - cover * 3000 : WET_FOG_FAR
  // Fill colours are lights, not the sky dome. Night sky bytes stay dark; the
  // hemi has to be brighter or a horizontal lawn reads as black.
  out.hemiSky = night > 0.55 ? '#9aafc8' : sunset > 0.45 ? '#d7c4a4' : '#b7cbe4'
  out.hemiGround = night > 0.55 ? '#4a5c58' : sunset > 0.45 ? '#6a7848' : '#4a5538'
  out.hemiIntensity = night > 0.55 ? 2.4 : sunset > 0.45 ? 2 : DAY_HEMI_INTENSITY
  writeCloudColours(out, weather, cover, exp, tone)
  return out
}

export function skyParams(
  sunAltitude: number,
  weather: string,
  cloudiness = 0,
  exposure?: number,
  tone: ToneMapSetting = DEFAULT_TONE,
): SkyParams {
  const alt = Number.isFinite(sunAltitude) ? sunAltitude : 0.6
  const exp = exposure ?? sunLook(alt).exposure
  return writeSkyParams(alt, weather, cloudiness, exp, createSkyParams(), tone)
}
