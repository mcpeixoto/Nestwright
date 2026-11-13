import { newId } from '../model/ids'
import type { Vec2 } from '../model/types'
import { useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'

let start: Vec2 | null = null
let hover: Vec2 | null = null

export function measurePreview(): { start: Vec2; hover: Vec2 | null } | null {
  if (!start) return null
  return { start, hover }
}

registerTool({
  id: 'measure',
  label: 'Measure',
  shortcut: 'M',
  group: 'measure',
  cursor: 'crosshair',
  icon: icon('<path d="M4 16l12-8M6 16h.01M9 14h.01M12 12h.01M15 10h.01"/>'),
  activate() {
    start = null
    hover = null
  },
  deactivate() {
    start = null
    hover = null
  },
  snapAnchor() {
    return start
  },
  onPointerMove(ctx) {
    if (start) hover = { ...ctx.point }
  },
  onPointerDown(ctx) {
    if (!start) {
      start = { ...ctx.point }
      hover = { ...ctx.point }
      return
    }
    const a = start
    const b = ctx.point
    start = null
    hover = null
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) return
    const levelId = useStore.getState().activeLevelId
    useStore.getState().apply('Dimension', (draft) => {
      const level = draft.levels.find((l) => l.id === levelId)
      if (!level) return
      level.dimensions.push({ id: newId('dim'), a: { ...a }, b: { ...b }, offset: 0.35 })
    })
  },
  onKeyDown(ctx) {
    if (ctx.key === 'Escape' && start) {
      start = null
      hover = null
      ctx.handled = true
    }
  },
  drawOverlay(ctx2d, ctx) {
    if (!start) return
    const end = hover ?? ctx.point
    const a = ctx.transform.worldToScreen(start)
    const b = ctx.transform.worldToScreen(end)
    ctx2d.save()
    ctx2d.strokeStyle = '#e8b86d'
    ctx2d.lineWidth = 1.5
    ctx2d.beginPath()
    ctx2d.moveTo(a.x, a.y)
    ctx2d.lineTo(b.x, b.y)
    ctx2d.stroke()
    ctx2d.restore()
  },
})
