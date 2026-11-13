import type { Vec2 } from './types'

export interface PlotRect {
  width: number
  depth: number
}

/**
 * Keep a brush sample on the plot. Points just outside the rectangle are
 * pulled onto the edge; hits on the distant ground (well past the plot) are
 * dropped so a ray that misses the terrain cannot plant at y = -27.
 */
export function clampBrushHit(point: Vec2, plot: PlotRect, slack = 1.5): Vec2 | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  const halfW = plot.width / 2
  const halfD = plot.depth / 2
  if (!(halfW > 0) || !(halfD > 0) || !(slack >= 0)) return null
  if (Math.abs(point.x) > halfW + slack || Math.abs(point.y) > halfD + slack) return null
  return {
    x: Math.min(halfW, Math.max(-halfW, point.x)),
    y: Math.min(halfD, Math.max(-halfD, point.y)),
  }
}
