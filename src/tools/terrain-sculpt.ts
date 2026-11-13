import { flatten, lower, raise, sampleHeight, smooth } from '../model/terrain'
import { useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { allowDab, getBrush } from './brushState'
import { strokeCircle } from './chain'
import { icon } from './icons'
import { registerTool } from './registry'
import type { Vec2 } from '../model/types'

let painting = false
let armed = false
let target = 0

export function terrainPreview(): Vec2[] {
  return []
}

export function terrainPointer(phase: 'down' | 'move' | 'up', point: Vec2): void {
  if (phase === 'up') {
    painting = false
    return
  }
  armed = true
  if (phase === 'down') {
    painting = true
    target = sampleHeight(useStore.getState().project.terrain, point.x, point.y)
  }
  if (!painting || !allowDab()) return
  const brush = getBrush()
  useStore.getState().apply('Sculpt terrain', (draft) => {
    const terrain = draft.terrain
    if (!terrain) return
    if (brush.sculpt === 'raise') raise(terrain, point, brush.radius, brush.strength * 0.65)
    else if (brush.sculpt === 'lower') lower(terrain, point, brush.radius, brush.strength * 0.65)
    else if (brush.sculpt === 'flatten') flatten(terrain, point, brush.radius, target, brush.strength)
    else smooth(terrain, point, brush.radius, brush.strength)
  })
}

registerShortcut({
  id: 'tool-sculpt',
  keys: 'h',
  description: 'Sculpt terrain',
  run: () => useStore.getState().setTool('terrain-sculpt'),
})

registerTool({
  id: 'terrain-sculpt',
  label: 'Sculpt',
  shortcut: 'H',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<path d="M3 17c3-1 4-6 7-6s3 4 6 4 4-3 5-4"/><path d="M4 20h16"/>'),
  activate() {
    painting = false
    armed = false
  },
  deactivate() {
    painting = false
    armed = false
  },
  onPointerDown(ctx) {
    terrainPointer('down', ctx.raw)
  },
  onPointerMove(ctx) {
    terrainPointer('move', ctx.raw)
  },
  onPointerUp() {
    terrainPointer('up', { x: 0, y: 0 })
  },
  drawOverlay(ctx2d, ctx) {
    if (!armed) return
    ctx2d.save()
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.lineWidth = 1.5
    strokeCircle(ctx2d, (p) => ctx.transform.worldToScreen(p), ctx.raw, getBrush().radius)
    ctx2d.restore()
  },
})
