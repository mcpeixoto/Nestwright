import { newId } from '../model/ids'
import type { Vec2 } from '../model/types'
import { useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { getBrush } from './brushState'
import { createChain, strokeChain, type ChainSnapshot } from './chain'
import { icon } from './icons'
import { registerTool } from './registry'

const chain = createChain({
  minPoints: 2,
  closeMetres: 0.8,
  onCommit(points) {
    const id = newId('fence')
    const brush = getBrush()
    useStore.getState().apply('Add fence', (draft) => {
      draft.terrain.fences.push({
        id,
        style: brush.fenceStyle,
        points: points.map((p) => ({ x: p.x, y: p.y })),
        height: brush.fenceHeight,
        gates: [],
      })
    })
    useStore.getState().select([id])
  },
})

export function fencePreview(): ChainSnapshot {
  return chain.snapshot()
}

export function fencePointer(phase: 'down' | 'move' | 'up', point: Vec2): void {
  if (phase === 'down') chain.add(point)
  else if (phase === 'move') chain.hover(point)
}

registerShortcut({
  id: 'tool-fence',
  keys: 'shift+f',
  description: 'Fence',
  run: () => useStore.getState().setTool('fence'),
})

registerTool({
  id: 'fence',
  label: 'Fence',
  shortcut: 'Shift+F',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<path d="M5 20V8M19 20V8M5 11h14M5 15h14"/><path d="M8 20V8M12 20V8M16 20V8"/>'),
  activate() {
    chain.reset()
  },
  deactivate() {
    chain.reset()
  },
  onPointerDown(ctx) {
    fencePointer('down', ctx.point)
  },
  onPointerMove(ctx) {
    fencePointer('move', ctx.point)
  },
  onKeyDown(ctx) {
    if (chain.key(ctx.key)) ctx.handled = true
  },
  drawOverlay(ctx2d, ctx) {
    const preview = fencePreview()
    ctx2d.save()
    ctx2d.strokeStyle = '#6b5344'
    ctx2d.fillStyle = '#6b5344'
    ctx2d.lineWidth = 1.5
    strokeChain(ctx2d, (p) => ctx.transform.worldToScreen(p), preview.points, preview.hover)
    ctx2d.restore()
  },
})
