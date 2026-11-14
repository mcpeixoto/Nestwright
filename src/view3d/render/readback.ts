import * as THREE from 'three'

/** A world-space point, or a point in the canvas's CSS pixels from its top-left. */
export type SamplePoint = readonly [number, number, number] | { readonly x: number; readonly y: number }

export interface PixelSample {
  /** Canvas backing-store pixel that was read. */
  px: number
  py: number
  /** sRGB-encoded bytes, as displayed (tone mapped, post chain applied). */
  r: number
  g: number
  b: number
}

/** Copy the canvas into a 2D canvas. Call in the same task as the render that drew it. */
export function captureCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || source.width < 2 || source.height < 2) return null
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, 0, 0)
  return out
}

const projected = new THREE.Vector3()

/** Backing-store pixel for a sample point, or null when it is behind the camera or off the canvas. */
export function pixelFor(
  point: SamplePoint,
  css: { width: number; height: number },
  backing: { width: number; height: number },
  camera: THREE.Camera,
): { px: number; py: number } | null {
  let u: number
  let v: number
  if (Array.isArray(point)) {
    const [x, y, z] = point as readonly [number, number, number]
    if (![x, y, z].every((value) => Number.isFinite(value))) return null
    projected.set(x, y, z).project(camera)
    if (projected.z < -1 || projected.z > 1) return null
    u = (projected.x + 1) / 2
    v = (1 - projected.y) / 2
  } else {
    const flat = point as { x: number; y: number }
    if (!Number.isFinite(flat.x) || !Number.isFinite(flat.y) || !(css.width > 0) || !(css.height > 0)) return null
    u = flat.x / css.width
    v = flat.y / css.height
  }
  if (u < 0 || u > 1 || v < 0 || v > 1) return null
  const px = Math.min(backing.width - 1, Math.max(0, Math.floor(u * backing.width)))
  const py = Math.min(backing.height - 1, Math.max(0, Math.floor(v * backing.height)))
  return { px, py }
}

export function samplePoints(
  frame: HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  points: readonly SamplePoint[],
): (PixelSample | null)[] {
  const ctx = frame.getContext('2d', { willReadFrequently: true })
  if (!ctx) return points.map(() => null)
  const css = { width: canvas.clientWidth, height: canvas.clientHeight }
  return points.map((point) => {
    const at = pixelFor(point, css, frame, camera)
    if (!at) return null
    const data = ctx.getImageData(at.px, at.py, 1, 1).data
    return { px: at.px, py: at.py, r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 }
  })
}
