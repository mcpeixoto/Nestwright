import type { GroundLayer, Vec2 } from '../model/types'
import { paintPath } from '../model/terrain'
import { useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { getBrush } from './brushState'
import { createChain, strokeChain, type ChainSnapshot } from './chain'
import { icon } from './icons'
import { registerTool } from './registry'

function pathLayer(): GroundLayer {
  const layer = getBrush().layer
  if (layer === 'path' || layer === 'paving' || layer === 'gravel') return layer
  return 'path'
}

const chain = createChain({
  minPoints: 2,
  closeMetres: 0,
  onCommit(points) {
    const width = Math.max(0.6, getBrush().radius)
    const layer = pathLayer()
    useStore.getState().apply('Paint path', (draft) => {
      paintPath(draft.terrain, points, width, layer)
    })
  },
})

export function pathPreview(): ChainSnapshot {
  return chain.snapshot()
}

export function pathPointer(phase: 'down' | 'move' | 'up', point: Vec2): void {
  if (phase === 'down') chain.add(point)
  else if (phase === 'move') chain.hover(point)
}

registerShortcut({
  id: 'tool-path',
  keys: 'k',
  description: 'Path',
  run: () => useStore.getState().setTool('path'),
})

registerTool({
  id: 'path',
  label: 'Path',
  shortcut: 'K',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<path d="M5 18c3-1 3-5 6-5s3 4 6 4 2-2 2-2"/><path d="M4 20h16"/>'),
  activate() {
    chain.reset()
  },
  deactivate() {
    chain.reset()
  },
  onPointerDown(ctx) {
    pathPointer('down', ctx.point)
  },
  onPointerMove(ctx) {
    pathPointer('move', ctx.point)
  },
  onKeyDown(ctx) {
    if (chain.key(ctx.key)) ctx.handled = true
  },
  drawOverlay(ctx2d, ctx) {
    const preview = pathPreview()
    const width = Math.max(0.6, getBrush().radius)
    ctx2d.save()
    ctx2d.strokeStyle = '#a68462'
    ctx2d.lineWidth = 1.5
    strokeChain(ctx2d, (p) => ctx.transform.worldToScreen(p), preview.points, preview.hover)
    const hover = preview.hover ?? preview.points[preview.points.length - 1]
    if (hover) {
      ctx2d.globalAlpha = 0.35
      const c = ctx.transform.worldToScreen(hover)
      const edge = ctx.transform.worldToScreen({ x: hover.x + width / 2, y: hover.y })
      ctx2d.beginPath()
      ctx2d.arc(c.x, c.y, Math.hypot(edge.x - c.x, edge.y - c.y), 0, Math.PI * 2)
      ctx2d.stroke()
    }
    ctx2d.restore()
  },
})
