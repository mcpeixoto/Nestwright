/** Black-body approximation (Tanner Helland). Returns #rrggbb. */
export function kelvinToHex(kelvin: number): string {
  const temp = Math.min(40000, Math.max(1000, kelvin)) / 100
  let r: number
  let g: number
  let b: number
  if (temp <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307
  } else {
    r = 329.698727446 * (temp - 60) ** -0.1332047592
    g = 288.1221695283 * (temp - 60) ** -0.0755148492
    b = 255
  }
  const channel = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

export function clampKelvin(value: number): number {
  if (!Number.isFinite(value)) return 2700
  return Math.min(6500, Math.max(2200, value))
}

export type LinearRgb = [number, number, number]

/** Kelvin range the black-body fit below is used over. */
export const KELVIN_MIN = 1000
export const KELVIN_MAX = 10000

/**
 * Linear sRGB colour of a black body at `kelvin`, scaled to luminance 1 so a light's
 * lumens stay its lumens whatever its colour. Planckian locus in CIE 1960 uv (Krystek 1985,
 * good to ~1e-4 over 1000–15000 K) → xyY → XYZ → linear sRGB; out-of-gamut channels clip to 0.
 * Channels may exceed 1 (a 2700 K lamp has red ≈ 1.4); three light colours accept that.
 */
export function kelvinToLinear(kelvin: number): LinearRgb {
  const t = Number.isFinite(kelvin) ? Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, kelvin)) : 2700
  const u = (0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t) / (1 + 8.42420235e-4 * t + 7.08145163e-7 * t * t)
  const v = (0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t) / (1 - 2.89741816e-5 * t + 1.61456053e-7 * t * t)
  const d = 2 * u - 8 * v + 4
  const x = (3 * u) / d
  const y = (2 * v) / d
  const X = x / y
  const Z = (1 - x - y) / y
  const r = Math.max(0, 3.2406 * X - 1.5372 - 0.4986 * Z)
  const g = Math.max(0, -0.9689 * X + 1.8758 + 0.0415 * Z)
  const b = Math.max(0, 0.0557 * X - 0.204 + 1.057 * Z)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0 ? [r / lum, g / lum, b / lum] : [1, 1, 1]
}

/** Luminous intensity in candela of an isotropic point source. */
export function pointCandela(lumens: number): number {
  return Math.max(0, Number.isFinite(lumens) ? lumens : 0) / (4 * Math.PI)
}

/**
 * Luminous intensity in candela of a spot that puts all its lumens into a cone of
 * half-angle `angle` radians (three's SpotLight.angle): lm / (2π(1 − cos θ)).
 */
export function spotCandela(lumens: number, angle: number): number {
  const theta = Number.isFinite(angle) ? Math.min(Math.PI / 2, Math.max(0.05, angle)) : Math.PI / 4
  const solid = 2 * Math.PI * (1 - Math.cos(theta))
  return Math.max(0, Number.isFinite(lumens) ? lumens : 0) / solid
}

/*
 * Lamps in proportion to the sky.
 *
 * Sun, sky and moon are not in lux: the game tone-compresses the world, and night renders
 * only ~1.3 stops below day (sun look exposure 0.42 vs 1.05) where a real night interior
 * sits ~8 stops below a daylit one. A lamp is a fixed physical source, so its scene value
 * has to follow the compression of whatever ambient it is seen against.
 *
 * Calibration, from the harness living room with no lamps (metered log2 luminance before
 * exposure, R3 meter):
 *   day   15:30   −4.44  → L = 0.046 scene units
 *   night 22:30   −3.81  → L = 0.071 (moon, night sky and window spill, auto lights on)
 * and the real rooms those stand for, at a mean reflectance ρ ≈ 0.5 (white walls, oak floor):
 *   day   ~1000 lx   (500–2000 lx indoors near a window)
 *   night ~3 lx      (a room lit only by moonlight and light from outside)
 * Scene irradiance per lux is then π·L / (ρ·E):
 *   day   π·0.046 / (0.5·1000) ≈ 2.9e-4
 *   night π·0.071 / (0.5·3)    ≈ 0.149
 * and in between it runs geometrically with the sun look's daylight (0 night … 1 day).
 *
 * Check: an 800 lm pendant is 64 cd; 2 m below it a table gets 16 lx from the bare bulb (a
 * shaded pendant aims most of it down, ~50–100 lx). By day that is ~1.6 % of the room's
 * daylight, invisible but for the glowing shade. At night it is ~5× the room's ambient: a
 * clear pool with dimmer surroundings, and the meter rises 1–2 stops, inside the exposure range.
 *
 * The old fixed factor (8 scene units per candela) put that table at ~130 units, ~50 times
 * the noon sun, which drove the meter to +4.5..+6 and bottomed the exposure out.
 */
/** Daylight illuminance of the reference room, lux. */
export const REF_DAY_LUX = 1000
/** Night illuminance of the reference room without lamps, lux. */
export const REF_NIGHT_LUX = 3
/** Metered log2 scene luminance of the reference room by day and by night, no lamps. */
export const REF_DAY_LOG2 = -4.44
export const REF_NIGHT_LOG2 = -3.81
/** Mean reflectance assumed for the reference room. */
export const REF_REFLECTANCE = 0.5

function sceneUnitsPerLux(log2: number, lux: number): number {
  return (Math.PI * Math.pow(2, log2)) / (REF_REFLECTANCE * lux)
}

export const SCENE_PER_LUX_DAY = sceneUnitsPerLux(REF_DAY_LOG2, REF_DAY_LUX)
export const SCENE_PER_LUX_NIGHT = sceneUnitsPerLux(REF_NIGHT_LOG2, REF_NIGHT_LUX)

/**
 * Scene units per candela (= per lux at 1 m) for a lamp seen at `daylight` (0 night … 1
 * day, the sun look's value): geometric between the night and day calibrations.
 */
export function lampSceneGain(daylight: number): number {
  const d = Number.isFinite(daylight) ? Math.min(1, Math.max(0, daylight)) : 1
  return Math.exp(Math.log(SCENE_PER_LUX_NIGHT) * (1 - d) + Math.log(SCENE_PER_LUX_DAY) * d)
}

/** Share of a lamp's flux a fabric or paper shade lets through, and the shade's glowing area. */
export const SHADE_TRANSMISSION = 0.25
export const SHADE_AREA_M2 = 0.25

/**
 * Luminance (cd/m², nits) of a lit shade: the flux it transmits spread over its area,
 * Lambertian (L = τΦ / (π A)). An 800 lm lamp gives ~255 nits: a little brighter than a
 * daylit white wall (~160), and far above everything else in a lamp-lit room at night.
 */
export function shadeLuminance(lumens: number): number {
  const flux = Math.max(0, Number.isFinite(lumens) ? lumens : 0)
  return (SHADE_TRANSMISSION * flux) / (Math.PI * SHADE_AREA_M2)
}

/**
 * Rough mean illuminance (lux) lamps add to a room's surfaces: their flux spread over the
 * room's inner area, raised by inter-reflection (1 / (1 − ρ)). For budgets and tests, not
 * rendering.
 */
export function roomLampLux(lumens: readonly number[], area: { w: number; d: number; h: number }, reflectance = REF_REFLECTANCE): number {
  const surface = 2 * (area.w * area.d) + 2 * area.h * (area.w + area.d)
  if (!(surface > 0)) return 0
  const flux = lumens.reduce((sum, lm) => sum + Math.max(0, Number.isFinite(lm) ? lm : 0), 0)
  const rho = Math.min(0.9, Math.max(0, reflectance))
  return flux / surface / (1 - rho)
}

/**
 * Metered log2 scene luminance of the reference room at `daylight` with `lampLux` added by
 * lamps (see roomLampLux): its ambient, interpolated like the gain, plus the lamps' share
 * at the scene's lux scale.
 */
export function roomMeterLog2(daylight: number, lampLux: number): number {
  const d = Number.isFinite(daylight) ? Math.min(1, Math.max(0, daylight)) : 1
  const ambient = Math.pow(2, REF_NIGHT_LOG2 * (1 - d) + REF_DAY_LOG2 * d)
  const lamps = (REF_REFLECTANCE / Math.PI) * Math.max(0, lampLux) * lampSceneGain(d)
  return Math.log2(ambient + lamps)
}

export const LUMENS_MIN = 0
export const LUMENS_MAX = 4000

export function clampLumens(value: number): number {
  if (!Number.isFinite(value)) return 800
  return Math.min(LUMENS_MAX, Math.max(LUMENS_MIN, value))
}

/** The parts of a catalog lamp spec the output depends on. */
export interface LampSpec {
  lumens: number
  kelvin: number
  /** Pre-0.7 relative intensity, used to read old saves' `params.intensity`. */
  intensity: number
}

/** The parts of an item the output depends on. */
export interface LampSource {
  lumens?: number
  kelvin?: number
  params?: Record<string, number | string | boolean>
}

/**
 * Lumens and colour temperature of a placed lamp: its own fields, else what a pre-0.7 save
 * kept in params (`kelvin`, and `intensity` relative to the catalog's old value), else the
 * catalog default.
 */
export function lampOutput(item: LampSource, spec: LampSpec): { lumens: number; kelvin: number } {
  let lumens = spec.lumens
  const legacy = item.params?.intensity
  if (typeof item.lumens === 'number' && Number.isFinite(item.lumens)) lumens = item.lumens
  else if (typeof legacy === 'number' && Number.isFinite(legacy) && spec.intensity > 0) lumens = (spec.lumens * legacy) / spec.intensity
  let kelvin = spec.kelvin
  const legacyKelvin = item.params?.kelvin
  if (typeof item.kelvin === 'number' && Number.isFinite(item.kelvin)) kelvin = item.kelvin
  else if (typeof legacyKelvin === 'number' && Number.isFinite(legacyKelvin)) kelvin = legacyKelvin
  return {
    lumens: clampLumens(lumens),
    kelvin: Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, kelvin)),
  }
}
