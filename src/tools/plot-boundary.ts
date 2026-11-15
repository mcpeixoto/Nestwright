import { dist, polygonArea } from '../model/geometry'
import type { Vec2 } from '../model/types'
import { formatArea } from '../model/units'
import { useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { fill } from '../i18n'
import { useSettings } from '../settings'
import { createChain, strokeChain, type ChainSnapshot } from './chain'
import { icon } from './icons'
import { registerTool } from './registry'

let drag = -1

function hitVertex(point: Vec2): number {
  const boundary = useStore.getState().project.terrain.boundary
  let best = -1
  let bestD = 0.6
  boundary.forEach((corner, index) => {
    const d = dist(point, corner)
    if (d <= bestD) {
      best = index
      bestD = d
    }
  })
  return best
}

const chain = createChain({
  minPoints: 3,
  closeMetres: 0.8,
  onCommit(points) {
    const body = points.length > 3 && points[0] && points[points.length - 1] && dist(points[0], points[points.length - 1]) < 1e-6
      ? points.slice(0, -1)
      : points
    if (body.length < 3) return
    useStore.getState().apply('Plot boundary', (draft) => {
      draft.terrain.boundary = body.map((p) => ({ x: p.x, y: p.y }))
    })
  },
})

export function boundaryPreview(): ChainSnapshot {
  return chain.snapshot()
}

export function boundaryPointer(phase: 'down' | 'move' | 'up', point: Vec2): void {
  if (phase === 'up') {
    drag = -1
    return
  }
  if (phase === 'down') {
    const drawing = chain.snapshot().points.length > 0
    const vertex = drawing ? -1 : hitVertex(point)
    if (vertex >= 0) {
      drag = vertex
      return
    }
    chain.add(point)
    return
  }
  if (drag >= 0) {
    const index = drag
    useStore.getState().apply('Move plot corner', (draft) => {
      const corner = draft.terrain.boundary[index]
      if (!corner) return
      corner.x = point.x
      corner.y = point.y
    })
    return
  }
  chain.hover(point)
}

registerShortcut({
  id: 'tool-boundary',
  keys: 'l',
  description: 'Plot boundary',
  run: () => useStore.getState().setTool('plot-boundary'),
})

registerTool({
  id: 'plot-boundary',
  label: 'Plot',
  shortcut: 'L',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<path d="M5 7l4-3 10 2-2 8-8 3-4-3z"/><path d="M5 7v7M9 4v10M19 6v8"/>'),
  activate() {
    chain.reset()
    drag = -1
    const state = useStore.getState()
    const area = Math.abs(polygonArea(state.project.terrain.boundary))
    state.setMessage(fill(useSettings.getState().language, 'Plot {area}', { area: formatArea(area, state.project.units) }))
  },
  deactivate() {
    chain.reset()
    drag = -1
  },
  onPointerDown(ctx) {
    boundaryPointer('down', ctx.point)
  },
  onPointerMove(ctx) {
    boundaryPointer('move', ctx.point)
  },
  onPointerUp(ctx) {
    boundaryPointer('up', ctx.point)
  },
  onKeyDown(ctx) {
    if (chain.key(ctx.key)) ctx.handled = true
  },
  drawOverlay(ctx2d, ctx) {
    const preview = boundaryPreview()
    ctx2d.save()
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.fillStyle = '#3FB8AF'
    ctx2d.setLineDash([5, 4])
    ctx2d.lineWidth = 1.5
    strokeChain(ctx2d, (p) => ctx.transform.worldToScreen(p), preview.points, preview.hover, true)
    ctx2d.restore()
  },
})
