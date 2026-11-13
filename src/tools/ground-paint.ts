import { paintLayer } from '../model/terrain'
import type { Vec2 } from '../model/types'
import { useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { allowDab, getBrush } from './brushState'
import { strokeCircle } from './chain'
import { icon } from './icons'
import { registerTool } from './registry'

let painting = false
let armed = false

export function paintPointer(phase: 'down' | 'move' | 'up', point: Vec2): void {
  if (phase === 'up') {
    painting = false
    return
  }
  armed = true
  if (phase === 'down') painting = true
  if (!painting || !allowDab()) return
  const brush = getBrush()
  useStore.getState().apply('Paint ground', (draft) => {
    paintLayer(draft.terrain, brush.layer, point, brush.radius, brush.strength)
  })
}

registerShortcut({
  id: 'tool-ground',
  keys: 'g',
  description: 'Paint ground',
  run: () => useStore.getState().setTool('ground-paint'),
})

registerTool({
  id: 'ground-paint',
  label: 'Ground',
  shortcut: 'G',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<circle cx="12" cy="13" r="4"/><path d="M12 3v3M5 8l2 2M19 8l-2 2"/>'),
  activate() {
    painting = false
    armed = false
  },
  deactivate() {
    painting = false
  },
  onPointerDown(ctx) {
    paintPointer('down', ctx.raw)
  },
  onPointerMove(ctx) {
    paintPointer('move', ctx.raw)
  },
  onPointerUp() {
    paintPointer('up', { x: 0, y: 0 })
  },
  drawOverlay(ctx2d, ctx) {
    if (!armed) return
    ctx2d.save()
    ctx2d.strokeStyle = '#E8B86D'
    ctx2d.lineWidth = 1.5
    strokeCircle(ctx2d, (p) => ctx.transform.worldToScreen(p), ctx.raw, getBrush().radius)
    ctx2d.restore()
  },
})
