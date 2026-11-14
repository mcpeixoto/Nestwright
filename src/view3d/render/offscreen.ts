import * as THREE from 'three'
import { useSettings } from '../../settings'
import { backendPreference, createRenderer } from './createRenderer'

/**
 * One small offscreen renderer for every thumbnail in the app (catalog items today). A
 * WebGPU device per caller costs memory and startup time, and the library can ask for
 * dozens of thumbnails at once. No post chain: thumbnails are a straight scene render.
 */
let renderer: THREE.WebGPURenderer | null = null
let starting: Promise<THREE.WebGPURenderer | null> | null = null
let failed = false

export const OFFSCREEN_SIZE = 128

export function getOffscreenRenderer(): Promise<THREE.WebGPURenderer | null> {
  if (failed) return Promise.resolve(null)
  if (renderer) return Promise.resolve(renderer)
  if (starting) return starting
  if (typeof document === 'undefined') {
    failed = true
    return Promise.resolve(null)
  }
  starting = (async () => {
    try {
      const search = typeof location === 'undefined' ? '' : location.search
      const preference = backendPreference(useSettings.getState().backend, search)
      const created = await createRenderer(
        () => {
          const canvas = document.createElement('canvas')
          canvas.width = OFFSCREEN_SIZE
          canvas.height = OFFSCREEN_SIZE
          return canvas
        },
        preference,
        { antialias: true, alpha: true },
      )
      if (!created) {
        failed = true
        return null
      }
      const gl = created.renderer
      gl.setPixelRatio(1)
      gl.setSize(OFFSCREEN_SIZE, OFFSCREEN_SIZE, false)
      gl.outputColorSpace = THREE.SRGBColorSpace
      gl.toneMapping = THREE.ACESFilmicToneMapping
      gl.toneMappingExposure = 1.05
      renderer = gl
      return gl
    } catch {
      failed = true
      return null
    } finally {
      starting = null
    }
  })()
  return starting
}
