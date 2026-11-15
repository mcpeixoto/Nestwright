import * as THREE from 'three'
import { useSettings, type ToneMapSetting } from '../../settings'

type RGB = [number, number, number]

export const DEFAULT_TONE: ToneMapSetting = 'agx'

/**
 * AgX at the same renderer exposure compresses sunlit surfaces harder than three's ACES
 * (which also scales by 1/0.6). This gain on the look exposure keeps day, sunset and night at
 * the brightness the sun look was tuned for: least-squares in display gamma over grey
 * 0.05–2 at the day (1.05), sunset (0.75) and night (0.42) exposures gives 1.13.
 */
export const AGX_EXPOSURE_GAIN = 1.15

/** `?tone=aces` (or `agx`) beats the saved setting, so the harness can compare the two. */
export function tonePreference(setting: ToneMapSetting, search: string | null | undefined): ToneMapSetting {
  try {
    const flag = new URLSearchParams(search ?? '').get('tone')?.toLowerCase()
    if (flag === 'aces' || flag === 'agx') return flag
  } catch {
    /* malformed query: the setting wins */
  }
  return setting === 'aces' ? 'aces' : 'agx'
}

function pageSearch(): string {
  try {
    return globalThis.location?.search ?? ''
  } catch {
    return ''
  }
}

let lastSetting: ToneMapSetting | null = null
let lastSearch = ''
let lastTone: ToneMapSetting = DEFAULT_TONE

/** The tone mapper this page renders with: the setting, unless the URL overrides it. Per-frame safe. */
export function activeTone(): ToneMapSetting {
  const search = pageSearch()
  const setting = useSettings.getState().toneMapping
  if (setting !== lastSetting || search !== lastSearch) {
    lastSetting = setting
    lastSearch = search
    lastTone = tonePreference(setting, search)
  }
  return lastTone
}

export function toneMappingFor(tone: ToneMapSetting): THREE.ToneMapping {
  return tone === 'aces' ? THREE.ACESFilmicToneMapping : THREE.AgXToneMapping
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/** The exposure to hand the renderer for a look exposure under a tone mapper. */
export function rendererExposure(exposure: number, tone: ToneMapSetting = DEFAULT_TONE): number {
  return tone === 'agx' ? exposure * AGX_EXPOSURE_GAIN : exposure
}

/** three.js `ACESFilmicToneMapping` (Narkowicz fit + the AP1 matrices + exposure/0.6). */
export function acesFilmic(color: readonly [number, number, number], exposure: number): RGB {
  const scale = exposure / 0.6
  const x = color[0] * scale
  const y = color[1] * scale
  const z = color[2] * scale
  const r = 0.59719 * x + 0.35458 * y + 0.04823 * z
  const g = 0.076 * x + 0.90834 * y + 0.01566 * z
  const b = 0.0284 * x + 0.13383 * y + 0.83777 * z
  const fit = (v: number) => {
    const a = v * (v + 0.0245786) - 0.000090537
    const d = v * (0.983729 * v + 0.432951) + 0.238081
    return d === 0 ? 0 : a / d
  }
  const fr = fit(r)
  const fg = fit(g)
  const fb = fit(b)
  return [
    clamp01(1.60475 * fr - 0.53108 * fg - 0.07367 * fb),
    clamp01(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb),
    clamp01(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb),
  ]
}

/** Column-major 3×3 times a vector, matching TSL `mat3(vec3 col0, col1, col2).mul(v)`. */
function mulCols(c0: RGB, c1: RGB, c2: RGB, v: RGB): RGB {
  return [
    c0[0] * v[0] + c1[0] * v[1] + c2[0] * v[2],
    c0[1] * v[0] + c1[1] * v[1] + c2[1] * v[2],
    c0[2] * v[0] + c1[2] * v[1] + c2[2] * v[2],
  ]
}

const SRGB_TO_2020: [RGB, RGB, RGB] = [
  [0.6274, 0.0691, 0.0164],
  [0.3293, 0.9195, 0.088],
  [0.0433, 0.0113, 0.8956],
]
const REC2020_TO_SRGB: [RGB, RGB, RGB] = [
  [1.6605, -0.1246, -0.0182],
  [-0.5876, 1.1329, -0.1006],
  [-0.0728, -0.0083, 1.1187],
]
const INSET: [RGB, RGB, RGB] = [
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
]
const OUTSET: [RGB, RGB, RGB] = [
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
]
const MIN_EV = -12.47393
const MAX_EV = 4.026069

function contrast(x: number): number {
  const x2 = x * x
  const x4 = x2 * x2
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232
}

/** three.js `AgXToneMapping` (the TSL `agxToneMapping`), exposure applied by the caller's gain. */
export function agx(color: readonly [number, number, number], exposure: number): RGB {
  const scaled: RGB = [color[0] * exposure, color[1] * exposure, color[2] * exposure]
  let c = mulCols(...SRGB_TO_2020, scaled)
  c = mulCols(...INSET, c)
  const curve = (v: number) => contrast(clamp01((Math.log2(Math.max(v, 1e-10)) - MIN_EV) / (MAX_EV - MIN_EV)))
  c = [curve(c[0]), curve(c[1]), curve(c[2])]
  c = mulCols(...OUTSET, c)
  c = [Math.pow(Math.max(0, c[0]), 2.2), Math.pow(Math.max(0, c[1]), 2.2), Math.pow(Math.max(0, c[2]), 2.2)]
  c = mulCols(...REC2020_TO_SRGB, c)
  return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]
}

/** Display-linear output for scene radiance at a look exposure, under the chosen tone mapper. */
export function toneMap(color: readonly [number, number, number], exposure: number, tone: ToneMapSetting = DEFAULT_TONE): RGB {
  return tone === 'aces' ? acesFilmic(color, exposure) : agx(color, rendererExposure(exposure, 'agx'))
}
