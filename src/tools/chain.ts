import { dist } from '../model/geometry'
import type { Vec2 } from '../model/types'

export interface ChainSnapshot {
  points: Vec2[]
  hover: Vec2 | null
}

export function createChain(opts: {
  minPoints: number
  closeMetres: number
  onCommit: (points: Vec2[]) => void
}) {
  let points: Vec2[] = []
  let hover: Vec2 | null = null

  const commit = (next: Vec2[]) => {
    points = []
    hover = null
    if (next.length >= opts.minPoints) opts.onCommit(next.map((p) => ({ x: p.x, y: p.y })))
  }

  return {
    snapshot(): ChainSnapshot {
      return { points, hover }
    },
    reset() {
      points = []
      hover = null
    },
    hover(point: Vec2) {
      hover = { x: point.x, y: point.y }
    },
    add(point: Vec2) {
      const first = points[0]
      if (opts.closeMetres > 0 && first && points.length >= opts.minPoints && dist(point, first) <= opts.closeMetres) {
        commit([...points, { x: first.x, y: first.y }])
        return
      }
      points = [...points, { x: point.x, y: point.y }]
    },
    finish() {
      commit(points)
    },
    back() {
      points = points.slice(0, -1)
    },
    key(key: string): boolean {
      if (key === 'Enter') {
        this.finish()
        return true
      }
      if (key === 'Escape') {
        this.reset()
        return true
      }
      if (key === 'Backspace') {
        this.back()
        return true
      }
      return false
    },
  }
}

export function strokeCircle(
  ctx2d: CanvasRenderingContext2D,
  worldToScreen: (p: Vec2) => { x: number; y: number },
  center: Vec2,
  radius: number,
): void {
  if (!(radius > 0)) return
  const c = worldToScreen(center)
  const edge = worldToScreen({ x: center.x + radius, y: center.y })
  const r = Math.hypot(edge.x - c.x, edge.y - c.y)
  if (!(r > 0.5)) return
  ctx2d.beginPath()
  ctx2d.arc(c.x, c.y, r, 0, Math.PI * 2)
  ctx2d.stroke()
}

export function strokeChain(
  ctx2d: CanvasRenderingContext2D,
  worldToScreen: (p: Vec2) => { x: number; y: number },
  points: readonly Vec2[],
  hover: Vec2 | null,
  closed = false,
): void {
  const draw = hover ? [...points, hover] : [...points]
  if (draw.length < 1) return
  ctx2d.beginPath()
  const first = worldToScreen(draw[0]!)
  ctx2d.moveTo(first.x, first.y)
  for (const point of draw.slice(1)) {
    const s = worldToScreen(point)
    ctx2d.lineTo(s.x, s.y)
  }
  if (closed && points.length >= 3) ctx2d.closePath()
  ctx2d.stroke()
  for (const point of points) {
    const s = worldToScreen(point)
    ctx2d.fillRect(s.x - 3, s.y - 3, 6, 6)
  }
}
