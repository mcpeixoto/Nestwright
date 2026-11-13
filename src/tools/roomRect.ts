import { addWallChain } from '../model/ops'
import type { Vec2 } from '../model/types'
import { useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'

let origin: Vec2 | null = null
let hover: Vec2 | null = null

export function roomRectPreview(): { origin: Vec2; hover: Vec2 } | null {
  if (!origin || !hover) return null
  return { origin, hover }
}

registerTool({
  id: 'room-rect',
  label: 'Room',
  shortcut: 'R',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<rect x="4" y="5" width="16" height="14" rx="1"/>'),
  activate() {
    origin = null
    hover = null
  },
  deactivate() {
    origin = null
    hover = null
  },
  onPointerDown(ctx) {
    origin = { ...ctx.point }
    hover = { ...ctx.point }
  },
  onPointerMove(ctx) {
    if (origin) hover = { ...ctx.point }
  },
  onPointerUp(ctx) {
    const start = origin
    origin = null
    hover = null
    if (!start) return
    const end = ctx.point
    if (Math.abs(end.x - start.x) < 0.2 || Math.abs(end.y - start.y) < 0.2) return
    const points = [
      { x: start.x, y: start.y },
      { x: end.x, y: start.y },
      { x: end.x, y: end.y },
      { x: start.x, y: end.y },
      { x: start.x, y: start.y },
    ]
    const id = useStore.getState().activeLevelId
    useStore.getState().apply('Draw room', (draft) => {
      const level = draft.levels.find((l) => l.id === id)
      if (level) addWallChain(level, points)
    })
  },
  drawOverlay(ctx2d, ctx) {
    const preview = roomRectPreview()
    if (!preview) return
    const a = ctx.transform.worldToScreen(preview.origin)
    const b = ctx.transform.worldToScreen(preview.hover)
    ctx2d.save()
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.lineWidth = 1.5
    ctx2d.setLineDash([5, 4])
    ctx2d.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    ctx2d.restore()
  },
})
