/**
 * Camera-cut detection for temporal effects. TRAA reprojects last frame's pixels with the
 * velocity buffer; after a jump (a view change, a fly-to, a template load) most of that history
 * belongs to another place and reads as a ghost for a few frames. A cut resets it instead.
 *
 * Pure: takes column-major 4×4 world matrices (THREE.Matrix4.elements).
 */

/** Metres the camera may move in one frame before it counts as a cut. */
export const CUT_DISTANCE = 1.5
/** Degrees the view direction may turn in one frame before it counts as a cut. */
export const CUT_ANGLE_DEG = 25

export function isCameraCut(previous: ArrayLike<number> | null, current: ArrayLike<number>): boolean {
  if (!previous) return true
  const dx = current[12] - previous[12]
  const dy = current[13] - previous[13]
  const dz = current[14] - previous[14]
  if (!Number.isFinite(dx + dy + dz)) return true
  if (Math.hypot(dx, dy, dz) > CUT_DISTANCE) return true
  // Column 2 is the camera's +Z (it looks down -Z); compare unit forward vectors.
  const a = unit(previous[8], previous[9], previous[10])
  const b = unit(current[8], current[9], current[10])
  if (!a || !b) return true
  const cos = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  return (Math.acos(cos) * 180) / Math.PI > CUT_ANGLE_DEG
}

function unit(x: number, y: number, z: number): [number, number, number] | null {
  const length = Math.hypot(x, y, z)
  if (!(length > 1e-9)) return null
  return [x / length, y / length, z / length]
}

/** Frames a TRAA history needs after a reset before a still (export, pixel sample) is clean. */
export const SETTLE_FRAMES = 8
