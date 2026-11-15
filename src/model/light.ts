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

/**
 * Scene units per candela. The sun and sky are not in lux (noon sun is ~2.5 irradiance
 * units, not 100 000 lx), so a physically sized lamp would vanish next to them. One factor
 * keeps lamps in proportion to each other and close to the hand-tuned R2 look: an 800 lm
 * pendant lands near the old pendant. Auto-exposure does the rest.
 */
export const LAMP_SCENE_GAIN = 8

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
