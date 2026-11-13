import type { Project, Vec2 } from '../model/types'

/** Small plan image for a gallery card. Empty or headless environments return ''. */
export function planThumb(project: Project): string {
  if (typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 200
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#f4f0e6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const points: Vec2[] = []
    for (const level of project.levels ?? []) {
      for (const wall of level.walls ?? []) points.push(wall.a, wall.b)
    }
    const boundary = project.terrain?.boundary ?? []
    if (points.length === 0) points.push(...boundary)
    if (points.length === 0) return canvas.toDataURL('image/jpeg', 0.8)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
    const spanX = Math.max(0.5, maxX - minX)
    const spanY = Math.max(0.5, maxY - minY)
    const pad = 16
    const scale = Math.min((canvas.width - pad * 2) / spanX, (canvas.height - pad * 2) / spanY)
    const ox = (canvas.width - spanX * scale) / 2
    const oy = (canvas.height - spanY * scale) / 2
    const map = (point: Vec2) => ({
      x: ox + (point.x - minX) * scale,
      y: oy + (maxY - point.y) * scale,
    })
    if (boundary.length >= 2) {
      ctx.beginPath()
      const first = map(boundary[0]!)
      ctx.moveTo(first.x, first.y)
      for (const point of boundary.slice(1)) {
        const next = map(point)
        ctx.lineTo(next.x, next.y)
      }
      ctx.closePath()
      ctx.strokeStyle = '#c4b49a'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.strokeStyle = '#2c3338'
    ctx.lineWidth = 2
    for (const level of project.levels ?? []) {
      for (const wall of level.walls ?? []) {
        const a = map(wall.a)
        const b = map(wall.b)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return ''
  }
}
