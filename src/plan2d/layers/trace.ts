import { pixelToPlan } from '../../model/trace'
import type { TraceImage } from '../../model/types'
import { getPlanRenderer } from '../PlanRenderer'
import { registerPlanLayer } from '../layers'

const images = new Map<string, HTMLImageElement>()
const loading = new Set<string>()
const failed = new Set<string>()

function imageFor(src: string): HTMLImageElement | null {
  const cached = images.get(src)
  if (cached?.complete && cached.naturalWidth > 0) return cached
  if (loading.has(src) || failed.has(src)) return null
  loading.add(src)
  const image = new Image()
  image.onload = () => {
    loading.delete(src)
    images.set(src, image)
    getPlanRenderer()?.requestDraw()
  }
  image.onerror = () => {
    loading.delete(src)
    failed.add(src)
  }
  image.src = src
  return null
}

function activeTrace(levelId: string, traces: readonly TraceImage[]): TraceImage | null {
  for (let i = traces.length - 1; i >= 0; i--) {
    const trace = traces[i]
    if (trace && trace.levelId === levelId && trace.visible !== false) return trace
  }
  return null
}

registerPlanLayer({
  id: 'trace',
  // Under walls (40) and rooms (20), above the ghost of the floor below.
  order: 19,
  draw(ctx2d, ctx) {
    const level = ctx.level
    if (!level) return
    const trace = activeTrace(level.id, ctx.project.traces)
    if (!trace) return
    const image = imageFor(trace.src)
    if (!image) return
    const origin = ctx.worldToScreen(trace.origin)
    const xAxis = ctx.worldToScreen(pixelToPlan(trace, { x: 1, y: 0 }))
    const yAxis = ctx.worldToScreen(pixelToPlan(trace, { x: 0, y: 1 }))
    ctx2d.save()
    ctx2d.globalAlpha = Math.min(1, Math.max(0, trace.opacity))
    ctx2d.transform(xAxis.x - origin.x, xAxis.y - origin.y, yAxis.x - origin.x, yAxis.y - origin.y, origin.x, origin.y)
    ctx2d.imageSmoothingEnabled = true
    ctx2d.drawImage(image, 0, 0)
    ctx2d.restore()
  },
})
