/**
 * Scale that fits an imported model into an item's size. Pure; `src/io/importModel.ts`
 * applies it to the loaded scene.
 *
 * `uniform` keeps the model's proportions and fits it inside the box, so one or two sides end
 * up smaller than typed. `stretch` scales each axis on its own to the exact w/d/h.
 */

export type AssetFit = 'uniform' | 'stretch'

export interface FitScale {
  x: number
  y: number
  z: number
}

const EPS = 1e-4

function finite(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** `measured` is the model's bounding-box size (x width, y height, z depth). */
export function fitScale(
  measured: { x: number; y: number; z: number },
  size: { w: number; d: number; h: number },
  mode: AssetFit | undefined,
): FitScale {
  const sx = size.w / Math.max(measured.x, EPS)
  const sy = size.h / Math.max(measured.y, EPS)
  const sz = size.d / Math.max(measured.z, EPS)
  if (mode === 'stretch') return { x: finite(sx), y: finite(sy), z: finite(sz) }
  const min = Math.min(sx, sy, sz)
  const uniform = Number.isFinite(min) ? min : 1
  return { x: uniform, y: uniform, z: uniform }
}
