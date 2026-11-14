/**
 * Window spill lights come from a fixed pool. three keys every material's pipeline on the ids
 * of the scene's lights (LightsNode.customCacheKey), so creating one PointLight per window made
 * every template load and every window edit rebuild the node programs of the whole scene: a
 * main-thread stall of seconds. The pool lights are made once and only move.
 */
export const SPILL_SLOTS = 4

export interface SpillPoint {
  x: number
  y: number
  z: number
}

/**
 * Which spills get a light: the `slots` nearest the camera, in the order of `spills` so a
 * spill keeps its slot while the camera moves a little. All of them when they fit.
 */
export function pickSpills(spills: readonly SpillPoint[], camera: SpillPoint, slots = SPILL_SLOTS): number[] {
  const count = Math.max(0, Math.floor(slots))
  const indices = spills.map((_, i) => i)
  if (spills.length <= count) return indices
  const distance = (i: number) => {
    const s = spills[i]
    if (!s) return Number.POSITIVE_INFINITY
    const d = Math.hypot(s.x - camera.x, s.y - camera.y, s.z - camera.z)
    return Number.isFinite(d) ? d : Number.POSITIVE_INFINITY
  }
  const nearest = [...indices].sort((a, b) => distance(a) - distance(b) || a - b).slice(0, count)
  return nearest.sort((a, b) => a - b)
}
