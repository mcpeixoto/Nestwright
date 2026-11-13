import { getEntry } from '../../catalog/registry'
import { swatchColor } from '../../materials/library'
import { add, perp, polylabel, scale, sub } from '../../model/geometry'
import { formatArea, formatLength } from '../../model/units'
import type { Level, Opening, RoomType, Vec2, Wall } from '../../model/types'
import { openingInterval, pointAlongWall, wallDirection, wallPolygon } from '../../model/walls'
import { roomsFor } from '../../store'
import { getTool } from '../../tools/registry'
import type { ToolContext } from '../../tools/types'
import { itemCorners } from '../snap'
import { fillPoly, paperLabel, strokeLine, strokePoly } from '../draw'
import { registerPlanLayer, type PlanDrawContext } from '../layers'
import { installOutsidePlan } from './outside'

const labelAt = new WeakMap<Vec2[], Vec2>()

function roomLabelPoint(polygon: Vec2[]): Vec2 {
  const cached = labelAt.get(polygon)
  if (cached) return cached
  const point = polylabel(polygon, 0.08)
  labelAt.set(polygon, point)
  return point
}

const ROOM_FILL: Record<RoomType, string> = {
  living: 'rgba(232, 184, 109, 0.32)',
  kitchen: 'rgba(214, 154, 122, 0.30)',
  dining: 'rgba(206, 170, 122, 0.30)',
  bedroom: 'rgba(142, 170, 198, 0.30)',
  bathroom: 'rgba(143, 190, 188, 0.32)',
  wc: 'rgba(143, 190, 188, 0.24)',
  office: 'rgba(168, 176, 154, 0.30)',
  hall: 'rgba(206, 200, 186, 0.40)',
  storage: 'rgba(176, 172, 164, 0.30)',
  laundry: 'rgba(164, 184, 196, 0.30)',
  garage: 'rgba(170, 170, 164, 0.30)',
  balcony: 'rgba(168, 196, 150, 0.30)',
  terrace: 'rgba(180, 196, 146, 0.30)',
  kids: 'rgba(214, 174, 160, 0.30)',
  other: 'rgba(196, 190, 180, 0.30)',
}

const FONT = 'ui-sans-serif, system-ui, sans-serif'

registerPlanLayer({
  id: 'grid',
  order: 0,
  draw(ctx2d, ctx) {
    const minor = 0.1 * 50 * ctx.zoom
    const step = minor >= 8 ? 0.1 : 1
    const origin = ctx.screenToWorld(0, ctx.height)
    const end = ctx.screenToWorld(ctx.width, 0)
    const x0 = Math.floor(origin.x / step) * step
    const y0 = Math.floor(origin.y / step) * step
    ctx2d.save()
    ctx2d.lineWidth = 1
    for (let x = x0; x <= end.x + step; x += step) {
      const major = step >= 1 || Math.abs(x - Math.round(x)) < 0.02
      ctx2d.strokeStyle = major ? 'rgba(70, 64, 54, 0.18)' : 'rgba(70, 64, 54, 0.08)'
      const sx = ctx.worldToScreen({ x, y: 0 }).x
      ctx2d.beginPath()
      ctx2d.moveTo(sx, 0)
      ctx2d.lineTo(sx, ctx.height)
      ctx2d.stroke()
    }
    for (let y = y0; y <= end.y + step; y += step) {
      const major = step >= 1 || Math.abs(y - Math.round(y)) < 0.02
      ctx2d.strokeStyle = major ? 'rgba(70, 64, 54, 0.18)' : 'rgba(70, 64, 54, 0.08)'
      const sy = ctx.worldToScreen({ x: 0, y }).y
      ctx2d.beginPath()
      ctx2d.moveTo(0, sy)
      ctx2d.lineTo(ctx.width, sy)
      ctx2d.stroke()
    }
    ctx2d.restore()
  },
})

registerPlanLayer({
  id: 'terrain',
  order: 10,
  draw(ctx2d, ctx) {
    const boundary = ctx.project.terrain.boundary
    if (!ctx.project.terrain.enabled || boundary.length < 3) return
    strokePoly(ctx2d, ctx, boundary, 'rgba(90, 122, 72, 0.28)', 1)
  },
})

registerPlanLayer({
  id: 'ghost',
  order: 15,
  draw(ctx2d, ctx) {
    const level = ctx.level
    if (!level || ctx.levelDisplay !== 'current-below') return
    let below: Level | null = null
    for (const other of ctx.project.levels) {
      if (other.elevation < level.elevation - 1e-4 && (!below || other.elevation > below.elevation)) below = other
    }
    if (!below) return
    ctx2d.save()
    ctx2d.globalAlpha = 0.28
    for (const wall of below.walls) fillPoly(ctx2d, ctx, wallPolygon(wall, below.walls), '#8a8478')
    ctx2d.restore()
  },
})

registerPlanLayer({
  id: 'rooms',
  order: 20,
  draw(ctx2d, ctx) {
    if (!ctx.level) return
    for (const room of roomsFor(ctx.level)) fillPoly(ctx2d, ctx, room.polygon, ROOM_FILL[room.type])
  },
})

registerPlanLayer({
  id: 'items',
  order: 30,
  draw(ctx2d, ctx) {
    if (!ctx.level) return
    for (const item of ctx.level.items) {
      const corners = itemCorners(item.position, item.size.w, item.size.d, item.rotation)
      const slot = Object.values(item.materials)[0]
      fillPoly(ctx2d, ctx, corners, swatchColor(slot?.id ?? 'oak-planks'))
      const selected = ctx.selection.includes(item.id)
      const stroke = selected ? '#3FB8AF' : ctx.hover === item.id ? '#e8b86d' : 'rgba(40, 36, 30, 0.65)'
      strokePoly(ctx2d, ctx, corners, stroke, selected ? 2 : 1)
    }
  },
})

registerPlanLayer({
  id: 'walls',
  order: 40,
  draw(ctx2d, ctx) {
    if (!ctx.level) return
    for (const wall of ctx.level.walls) {
      if (wall.kind === 'railing') continue
      const poly = wallPolygon(wall, ctx.level.walls)
      fillPoly(ctx2d, ctx, poly, '#2c2926')
      if (ctx.selection.includes(wall.id)) strokePoly(ctx2d, ctx, poly, '#3FB8AF', 2)
      else if (ctx.hover === wall.id) strokePoly(ctx2d, ctx, poly, '#e8b86d', 1.5)
    }
  },
})

registerPlanLayer({
  id: 'openings',
  order: 50,
  draw(ctx2d, ctx) {
    if (!ctx.level) return
    for (const wall of ctx.level.walls) {
      if (wall.kind === 'railing') continue
      for (const opening of ctx.level.openings) {
        if (opening.wallId !== wall.id) continue
        drawOpening(ctx2d, ctx, wall, opening)
      }
    }
  },
})

registerPlanLayer({
  id: 'labels',
  order: 60,
  draw(ctx2d, ctx) {
    if (!ctx.level) return
    const units = ctx.project.units
    for (const room of roomsFor(ctx.level)) {
      const at = roomLabelPoint(room.polygon)
      const anchor = ctx.worldToScreen(at)
      let reach = 0
      for (const p of room.polygon) {
        const s = ctx.worldToScreen(p)
        reach = Math.max(reach, Math.hypot(s.x - anchor.x, s.y - anchor.y))
      }
      if (reach < 28) continue
      paperLabel(ctx2d, anchor.x, anchor.y, [
        { text: room.name, font: `13px ${FONT}`, color: '#3a342c' },
        { text: formatArea(room.area, units), font: `11px ${FONT}`, color: '#5c564c' },
      ])
    }
    const showAllNames = ctx.zoom > ctx.defaultZoom * 2
    for (const item of ctx.level.items) {
      const picked = ctx.selection.includes(item.id) || ctx.hover === item.id
      if (!picked && !showAllNames) continue
      const at = ctx.worldToScreen(item.position)
      const name = getEntry(item.catalogId)?.name ?? item.catalogId.replace(/-/g, ' ')
      paperLabel(ctx2d, at.x, at.y, [{ text: name, font: `11px ${FONT}`, color: '#2a261f' }])
    }
  },
})

registerPlanLayer({
  id: 'dimensions',
  order: 80,
  draw(ctx2d, ctx) {
    if (!ctx.level) return
    const units = ctx.project.units
    for (const dim of ctx.level.dimensions) {
      drawDim(ctx2d, ctx, dim.a, dim.b, dim.offset, formatLength(Math.hypot(dim.b.x - dim.a.x, dim.b.y - dim.a.y), units), ctx.selection.includes(dim.id))
    }
    for (const wall of ctx.level.walls) {
      if (!ctx.selection.includes(wall.id)) continue
      drawDim(ctx2d, ctx, wall.a, wall.b, 0.45, formatLength(Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y), units), true)
    }
  },
})

registerPlanLayer({
  id: 'overlays',
  order: 100,
  draw(ctx2d, ctx) {
    const tool = getTool(ctx.toolId)
    if (!tool?.drawOverlay) return
    const toolCtx: ToolContext = {
      ...ctx.pointer,
      button: 0,
      key: '',
      handled: false,
      transform: ctx.transform,
    }
    tool.drawOverlay(ctx2d, toolCtx)
  },
})

function drawOpening(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, wall: Wall, opening: Opening): void {
  const span = openingInterval(wall, opening)
  const a = pointAlongWall(wall, span.start)
  const b = pointAlongWall(wall, span.end)
  const dir = wallDirection(wall)
  const n = perp(dir)
  const half = wall.thickness / 2 + 0.012
  const gap = [add(a, scale(n, half)), add(b, scale(n, half)), add(b, scale(n, -half)), add(a, scale(n, -half))]
  fillPoly(ctx2d, ctx, gap, '#f4f0e6')
  const doorish = opening.type === 'door' || opening.type === 'double-door' || opening.type === 'arch'
  ctx2d.save()
  ctx2d.strokeStyle = '#2c2926'
  ctx2d.lineWidth = 1.2
  if (doorish) {
    const along = opening.flipHinge ? { x: -dir.x, y: -dir.y } : dir
    const hinge = opening.flipHinge ? b : a
    let side = n
    if (opening.flipSide) side = { x: -side.x, y: -side.y }
    const cross = along.x * side.y - along.y * side.x
    const sign = cross >= 0 ? 1 : -1
    ctx2d.beginPath()
    const hingeS = ctx.worldToScreen(hinge)
    ctx2d.moveTo(hingeS.x, hingeS.y)
    for (let i = 0; i <= 14; i++) {
      const ang = sign * (i / 14) * (Math.PI / 2)
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      const p = {
        x: hinge.x + (along.x * c - along.y * s) * opening.width,
        y: hinge.y + (along.x * s + along.y * c) * opening.width,
      }
      const sp = ctx.worldToScreen(p)
      ctx2d.lineTo(sp.x, sp.y)
    }
    ctx2d.stroke()
  } else {
    const inset = wall.thickness * 0.22
    strokeLine(ctx2d, ctx, add(a, scale(n, inset)), add(b, scale(n, inset)))
    strokeLine(ctx2d, ctx, add(a, scale(n, -inset)), add(b, scale(n, -inset)))
  }
  ctx2d.restore()
}

function drawDim(
  ctx2d: CanvasRenderingContext2D,
  ctx: PlanDrawContext,
  a: Vec2,
  b: Vec2,
  offset: number,
  label: string,
  selected: boolean,
): void {
  const delta = sub(b, a)
  const length = Math.hypot(delta.x, delta.y)
  if (length < 1e-4) return
  const n = perp({ x: delta.x / length, y: delta.y / length })
  const p = add(a, scale(n, offset))
  const q = add(b, scale(n, offset))
  ctx2d.save()
  ctx2d.strokeStyle = selected ? '#3FB8AF' : '#5c564c'
  ctx2d.fillStyle = selected ? '#1d6f69' : '#3a342c'
  ctx2d.lineWidth = 1
  strokeLine(ctx2d, ctx, a, p)
  strokeLine(ctx2d, ctx, b, q)
  strokeLine(ctx2d, ctx, p, q)
  const mid = ctx.worldToScreen({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
  ctx2d.font = `12px ${FONT}`
  ctx2d.textAlign = 'center'
  ctx2d.fillText(label, mid.x, mid.y - 4)
  ctx2d.restore()
}

installOutsidePlan()
