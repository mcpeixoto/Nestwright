import type { Vec2 } from '../model/types'
import type { PlanDrawContext } from './layers'

export function fillPoly(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, points: readonly Vec2[], color: string): void {
  if (points.length < 3) return
  ctx2d.beginPath()
  const first = ctx.worldToScreen(points[0]!)
  ctx2d.moveTo(first.x, first.y)
  for (const p of points.slice(1)) {
    const s = ctx.worldToScreen(p)
    ctx2d.lineTo(s.x, s.y)
  }
  ctx2d.closePath()
  ctx2d.fillStyle = color
  ctx2d.fill()
}

export function strokePoly(
  ctx2d: CanvasRenderingContext2D,
  ctx: PlanDrawContext,
  points: readonly Vec2[],
  color: string,
  width: number,
): void {
  if (points.length < 2) return
  ctx2d.save()
  ctx2d.strokeStyle = color
  ctx2d.lineWidth = width
  ctx2d.beginPath()
  const first = ctx.worldToScreen(points[0]!)
  ctx2d.moveTo(first.x, first.y)
  for (const p of points.slice(1)) {
    const s = ctx.worldToScreen(p)
    ctx2d.lineTo(s.x, s.y)
  }
  ctx2d.closePath()
  ctx2d.stroke()
  ctx2d.restore()
}

export function strokeLine(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, a: Vec2, b: Vec2): void {
  const p = ctx.worldToScreen(a)
  const q = ctx.worldToScreen(b)
  ctx2d.beginPath()
  ctx2d.moveTo(p.x, p.y)
  ctx2d.lineTo(q.x, q.y)
  ctx2d.stroke()
}

/** Paper halo so a label stays readable on top of furniture and room fills. */
export function paperLabel(
  ctx2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: { text: string; font: string; color: string }[],
): void {
  if (lines.length === 0) return
  ctx2d.save()
  ctx2d.textAlign = 'center'
  ctx2d.textBaseline = 'middle'
  const lineH = 15
  let maxW = 0
  for (const line of lines) {
    ctx2d.font = line.font
    maxW = Math.max(maxW, ctx2d.measureText(line.text).width)
  }
  const totalH = lineH * lines.length
  const top = y - totalH / 2
  ctx2d.fillStyle = 'rgba(244, 240, 230, 0.92)'
  const padX = 7
  const padY = 4
  const rx = x - maxW / 2 - padX
  const ry = top - padY
  const rw = maxW + padX * 2
  const rh = totalH + padY * 2
  ctx2d.beginPath()
  if (typeof ctx2d.roundRect === 'function') ctx2d.roundRect(rx, ry, rw, rh, 6)
  else ctx2d.rect(rx, ry, rw, rh)
  ctx2d.fill()
  lines.forEach((line, index) => {
    ctx2d.font = line.font
    ctx2d.fillStyle = line.color
    ctx2d.fillText(line.text, x, top + lineH * index + lineH / 2)
  })
  ctx2d.restore()
}
