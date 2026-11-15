import { clearanceIssues, issuesFor, itemFootprint, itemOverlaps, overlappingIds, type ClearanceIssue } from '../../model/clearance'
import type { Level, Vec2 } from '../../model/types'
import { strokePoly } from '../draw'
import { registerPlanLayer, type PlanDrawContext } from '../layers'

const WARN = '#d9822b'
const HATCH = 'rgba(217, 130, 43, 0.55)'

const overlapCache = new WeakMap<Level, Set<string>>()
const clearanceCache = new WeakMap<Level, ClearanceIssue[]>()

/** Ids of items that overlap furniture or walls, cached per level revision. */
export function overlapIdsFor(level: Level): Set<string> {
  let ids = overlapCache.get(level)
  if (!ids) {
    ids = overlappingIds(itemOverlaps(level))
    overlapCache.set(level, ids)
  }
  return ids
}

/** Clearance issues of the level, cached per level revision. */
export function clearanceFor(level: Level): ClearanceIssue[] {
  let issues = clearanceCache.get(level)
  if (!issues) {
    issues = clearanceIssues(level)
    clearanceCache.set(level, issues)
  }
  return issues
}

function hatch(ctx2d: CanvasRenderingContext2D, ctx: PlanDrawContext, poly: readonly Vec2[]) {
  if (poly.length < 3) return
  const screen = poly.map((p) => ctx.worldToScreen(p))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  ctx2d.beginPath()
  screen.forEach((p, i) => {
    if (i === 0) ctx2d.moveTo(p.x, p.y)
    else ctx2d.lineTo(p.x, p.y)
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  })
  ctx2d.closePath()
  ctx2d.save()
  ctx2d.fillStyle = 'rgba(217, 130, 43, 0.1)'
  ctx2d.fill()
  ctx2d.clip()
  ctx2d.strokeStyle = HATCH
  ctx2d.lineWidth = 1
  ctx2d.beginPath()
  const span = maxY - minY
  for (let x = minX - span; x < maxX; x += 7) {
    ctx2d.moveTo(x, maxY)
    ctx2d.lineTo(x + span, minY)
  }
  ctx2d.stroke()
  ctx2d.restore()
}

registerPlanLayer({
  id: 'furniture-warnings',
  order: 32,
  draw(ctx2d, ctx) {
    const level = ctx.level
    if (!level || level.items.length === 0) return
    const overlaps = overlapIdsFor(level)
    for (const item of level.items) {
      if (!overlaps.has(item.id)) continue
      ctx2d.save()
      ctx2d.setLineDash([4, 3])
      strokePoly(ctx2d, ctx, itemFootprint(item), WARN, 2)
      ctx2d.restore()
    }
    const selected = level.items.filter((item) => ctx.selection.includes(item.id)).map((item) => item.id)
    if (selected.length === 0) return
    for (const issue of issuesFor(clearanceFor(level), selected)) hatch(ctx2d, ctx, issue.area)
  },
})
