import * as THREE from 'three'
import type { RendererBackendSetting } from '../../settings'

export type RendererBackend = 'webgpu' | 'webgl2'

export interface CreatedRenderer {
  renderer: THREE.WebGPURenderer
  backend: RendererBackend
}

/** `?renderer=webgl` (or `webgpu`) beats the saved setting, so a harness can force a path. */
export function backendPreference(setting: RendererBackendSetting, search: string | null | undefined): RendererBackendSetting {
  try {
    const flag = new URLSearchParams(search ?? '').get('renderer')?.toLowerCase()
    if (flag === 'webgl' || flag === 'webgl2') return 'webgl'
    if (flag === 'webgpu') return 'webgpu'
  } catch {
    /* a malformed query string falls through to the setting */
  }
  return setting === 'webgl' || setting === 'webgpu' ? setting : 'auto'
}

/** Which backend an initialised renderer ended up on (WebGPURenderer falls back on its own). */
export function rendererBackend(renderer: { backend?: unknown } | null | undefined): RendererBackend {
  const backend = renderer?.backend as { isWebGPUBackend?: boolean } | undefined
  return backend?.isWebGPUBackend === true ? 'webgpu' : 'webgl2'
}

let logged = false

function logBackend(backend: RendererBackend): void {
  if (logged) return
  logged = true
  console.info(`[nestwright] renderer backend: ${backend}`)
}

export interface RendererOptions {
  antialias?: boolean
  alpha?: boolean
}

/**
 * Limits raised past WebGPU's defaults when the adapter allows it. At Ultra the ground splat's
 * fragment stage samples 17 textures (eight layers, two weight maps, the lawn scan's relief,
 * shadows and probes) against a default of 16; past it the pipeline is invalid and the ground
 * is not drawn at all.
 */
const RAISED_LIMITS = { maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16 } as const

type RaisedLimit = keyof typeof RAISED_LIMITS

/** Every raised limit the adapter offers above the default; nothing it does not report. */
export function raisedLimits(limits: Partial<Record<RaisedLimit, number>> | null | undefined): Partial<Record<RaisedLimit, number>> {
  const out: Partial<Record<RaisedLimit, number>> = {}
  for (const key of Object.keys(RAISED_LIMITS) as RaisedLimit[]) {
    const offered = limits?.[key]
    if (typeof offered === 'number' && offered > RAISED_LIMITS[key]) out[key] = offered
  }
  return out
}

interface GpuLike {
  requestAdapter(options?: object): Promise<{ limits: Partial<Record<RaisedLimit, number>> } | null>
}

/**
 * The limits of the adapter three will pick. Same options as its WebGPUBackend, so a limit
 * read here is one the device request can be granted. Null without WebGPU or an adapter.
 */
export async function adapterLimits(gpu: GpuLike | null | undefined): Promise<Partial<Record<RaisedLimit, number>> | null> {
  if (!gpu) return null
  try {
    const adapter = await gpu.requestAdapter({ featureLevel: 'compatibility' })
    return adapter?.limits ?? null
  } catch {
    return null
  }
}

async function attempt(canvas: HTMLCanvasElement, forceWebGL: boolean, options: RendererOptions): Promise<THREE.WebGPURenderer> {
  const gpu = forceWebGL ? null : (globalThis.navigator as { gpu?: GpuLike } | undefined)?.gpu
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: options.antialias ?? false,
    alpha: options.alpha ?? false,
    forceWebGL,
    requiredLimits: raisedLimits(await adapterLimits(gpu)),
  })
  try {
    await renderer.init()
    return renderer
  } catch (err) {
    renderer.dispose()
    throw err
  }
}

/**
 * WebGPU first (three falls back to its WebGL2 backend when no adapter is found). If init
 * still throws, one forced-WebGL try follows; a canvas that already holds a WebGPU context
 * cannot give a WebGL one, so that second try can fail too. Resolves null when neither works,
 * which the caller treats as "3D unavailable".
 *
 * Pass a canvas factory instead of a canvas (an offscreen renderer) and each try gets a fresh
 * canvas, so the WebGL retry can work too.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement | (() => HTMLCanvasElement),
  preference: RendererBackendSetting,
  options: RendererOptions = {},
): Promise<CreatedRenderer | null> {
  const order = preference === 'webgl' ? [true] : [false, true]
  let lastError: unknown = null
  for (const forceWebGL of order) {
    try {
      const renderer = await attempt(typeof canvas === 'function' ? canvas() : canvas, forceWebGL, options)
      const backend = rendererBackend(renderer)
      logBackend(backend)
      return { renderer, backend }
    } catch (err) {
      lastError = err
    }
  }
  console.warn('[nestwright] 3D renderer unavailable', lastError)
  return null
}
