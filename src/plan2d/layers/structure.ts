import { curveHandle } from '../../model/curve'
import { add, polygonCentroid, scale, sub } from '../../model/geometry'
import { buildRoofModel } from '../../model/roofs'
import { computeStairSteps, cutHeight } from '../../model/stairs'
import type { Level, Stair, Vec2 } from '../../model/types'
import { wallFrame, wallPolygon } from '../../model/walls'
import { useStore } from '../../store'
import { fillPoly, strokeLine, strokePoly } from '../draw'
import { registerPlanLayer, type PlanDrawContext } from '../layers'

registerPlanLayer({
  id: 'other-levels',
  order: 16,
  draw(ctx2d, ctx) {
    if (!ctx.level || ctx.width < 2 || ctx.height < 2) return
    if (ctx.levelDisplay === 'all') {
      ctx2d.save()
      ctx2d.globalAlpha = 0.22
      for (const level of ctx.project.levels) {
        if (level.id === ctx.level.id) continue
        for (const wall of level.walls) {
          if (wall.kind === 'railing') strokeChain(ctx2d, ctx, wallFrame(wall).points, '#5c564c')
          else fillPoly(ctx2d, ctx, wallPolygon(wall, level.walls), '#8a8478')
        }
      }
      ctx2d.restore()
    }
    if (ctx.levelDisplay !== 'current-below' && ctx.levelDisplay !== 'all') return
    const below = levelBelow(ctx)
    if (!below || ctx.levelDisplay === 'all') return
    ctx2d.save()
    ctx2d.globalAlpha = 0.35
    drawLevelMarks(ctx2d, ctx, below, false)
    ctx2d.restore()
  },
})

registerPlanLayer({
  id: 'structure',
  order: 55,
  draw(ctx2d, ctx) {
    if (!ctx.level || ctx.width < 2 || ctx.height < 2) return
    drawLevelMarks(ctx2d, ctx, ctx.level, true)
    if (ctx.levelDisplay === 'all') {
      ctx2d.save()
      ctx2d.globalAlpha = 0.45
      for (const level of ctx.project.levels) {
        if (level.id === ctx.level.id) continue
        drawLevelMarks(ctx2d, ctx, level, false)
      }
      ctx2d.restore()
    }
    for (const wall of ctx.level.walls) {
      if (!ctx.selection.includes(wall.id) || wall.kind === 'railing') continue
      const at = ctx.worldToScreen(curveHandle(wall))
      ctx2d.save()
      ctx2d.fillStyle = '#3FB8AF'
      ctx2d.strokeStyle = '#143c39'
      ctx2d.lineWidth = 1
      ctx2d.beginPath()
      ctx2d.arc(at.x, at.y, 5, 0, Math.PI * 2)
      ctx2d.fill()
      ctx2d.stroke()
      ctx2d.restore()
    }
  },
})

function drawLevelMarks(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, level: Level, active: boolean) {
  for (const wall of level.walls) {
    if (wall.kind !== 'railing') continue
    strokeChain(ctx2d, ctx, wallFrame(wall).points, ctx.selection.includes(wall.id) ? '#3FB8AF' : '#5c564c')
  }
  for (const slab of level.slabs) {
    fillPoly(ctx2d, ctx, slab.polygon, 'rgba(183, 180, 174, 0.45)')
    strokePoly(ctx2d, ctx, slab.polygon, ctx.selection.includes(slab.id) ? '#3FB8AF' : '#6d675c', 1)
  }
  for (const column of level.columns) {
    const at = ctx.worldToScreen(column.position)
    const r = Math.max(3, (column.size / 2) * 50 * ctx.zoom)
    ctx2d.save()
    ctx2d.fillStyle = ctx.selection.includes(column.id) ? '#3FB8AF' : '#4a453e'
    ctx2d.beginPath()
    if (column.round) ctx2d.arc(at.x, at.y, r, 0, Math.PI * 2)
    else ctx2d.rect(at.x - r, at.y - r, r * 2, r * 2)
    ctx2d.fill()
    ctx2d.restore()
  }
  for (const stair of level.stairs) drawStair(ctx2d, ctx, stair, level)
  if (!useStore.getState().showRoofs) return
  if (!active && ctx.levelDisplay !== 'all') return
  for (const roof of level.roofs) {
    const model = buildRoofModel(roof)
    const selected = ctx.selection.includes(roof.id)
    ctx2d.save()
    ctx2d.setLineDash([7, 5])
    strokePoly(ctx2d, ctx, model.footprint, selected ? '#3FB8AF' : '#8e4638', selected ? 2 : 1)
    ctx2d.restore()
    ctx2d.save()
    ctx2d.strokeStyle = selected ? '#3FB8AF' : '#8e4638'
    ctx2d.lineWidth = 1
    for (const [a, b] of model.ridges) strokeLine(ctx2d, ctx, a, b)
    for (const cut of model.cutouts) strokePoly(ctx2d, ctx, cut, '#6aa8c8', 1)
    ctx2d.restore()
  }
}

function drawStair(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, stair: Stair, level: Level) {
  const layout = computeStairSteps(stair, level.height)
  if (layout.steps.length === 0) return
  const cut = cutHeight()
  const selected = ctx.selection.includes(stair.id)
  ctx2d.save()
  ctx2d.strokeStyle = selected ? '#3FB8AF' : '#2c2926'
  ctx2d.lineWidth = selected ? 1.6 : 1
  let broke = false
  for (const step of layout.steps) {
    if (!broke && step.height > cut) {
      cutMark(ctx2d, ctx, step.polygon)
      broke = true
      continue
    }
    if (broke) continue
    strokePoly(ctx2d, ctx, step.polygon, selected ? '#3FB8AF' : '#2c2926', 1)
  }
  const first = layout.steps[0]
  const next = layout.steps[Math.min(2, layout.steps.length - 1)]
  if (first && next && first !== next) {
    const from = polygonCentroid(first.polygon)
    const toward = polygonCentroid(next.polygon)
    const delta = sub(toward, from)
    const length = Math.hypot(delta.x, delta.y) || 1
    const tip = add(from, scale(delta, Math.min(0.55, length) / length))
    arrow(ctx2d, ctx, from, tip)
  }
  ctx2d.restore()
}

function cutMark(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, poly: readonly Vec2[]) {
  if (poly.length < 3) return
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const acrossX = maxX - minX >= maxY - minY
  const a = acrossX ? { x: minX, y: (minY + maxY) / 2 } : { x: (minX + maxX) / 2, y: minY }
  const b = acrossX ? { x: maxX, y: (minY + maxY) / 2 } : { x: (minX + maxX) / 2, y: maxY }
  const jog = acrossX ? 0.12 : 0
  const jogY = acrossX ? 0 : 0.12
  const p1 = { x: a.x + (b.x - a.x) * 0.42, y: a.y + (b.y - a.y) * 0.42 }
  const p2 = { x: a.x + (b.x - a.x) * 0.58 + jog, y: a.y + (b.y - a.y) * 0.58 + jogY }
  strokeLine(ctx2d, ctx, a, p1)
  strokeLine(ctx2d, ctx, p1, p2)
  strokeLine(ctx2d, ctx, p2, b)
}

function arrow(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, from: Vec2, to: Vec2) {
  const a = ctx.worldToScreen(from)
  const b = ctx.worldToScreen(to)
  ctx2d.beginPath()
  ctx2d.moveTo(a.x, a.y)
  ctx2d.lineTo(b.x, b.y)
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const head = 9
  ctx2d.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45))
  ctx2d.moveTo(b.x, b.y)
  ctx2d.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45))
  ctx2d.stroke()
}

function strokeChain(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, points: readonly Vec2[], color: string) {
  if (points.length < 2) return
  ctx2d.save()
  ctx2d.strokeStyle = color
  ctx2d.lineWidth = 1.4
  ctx2d.beginPath()
  const first = ctx.worldToScreen(points[0]!)
  ctx2d.moveTo(first.x, first.y)
  for (const p of points.slice(1)) {
    const s = ctx.worldToScreen(p)
    ctx2d.lineTo(s.x, s.y)
  }
  ctx2d.stroke()
  ctx2d.restore()
}

function levelBelow(ctx: PlanDrawContext): Level | null {
  const level = ctx.level
  if (!level) return null
  let below: Level | null = null
  for (const other of ctx.project.levels) {
    if (other.elevation < level.elevation - 1e-4 && (!below || other.elevation > below.elevation)) below = other
  }
  return below
}
