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

async function attempt(canvas: HTMLCanvasElement, forceWebGL: boolean): Promise<THREE.WebGPURenderer> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, forceWebGL })
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
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  preference: RendererBackendSetting,
): Promise<CreatedRenderer | null> {
  const order = preference === 'webgl' ? [true] : [false, true]
  let lastError: unknown = null
  for (const forceWebGL of order) {
    try {
      const renderer = await attempt(canvas, forceWebGL)
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
