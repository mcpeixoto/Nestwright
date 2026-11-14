import { translate } from '../i18n'
import { addWallChain } from '../model/ops'
import type { Vec2 } from '../model/types'
import { formatLength, parseSize } from '../model/units'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'
import { typedCorner, typeKey } from './typedInput'

/** Smallest side a drawn room may have. */
const MIN_SIDE = 0.2

let origin: Vec2 | null = null
let hover: Vec2 | null = null
/** Pointer is held: the room follows a drag. Released without moving: click-click mode. */
let dragging = false
let typed = ''

export function roomRectPreview(): { origin: Vec2; hover: Vec2 } | null {
  if (!origin || !hover) return null
  return { origin, hover }
}

function reset(): void {
  origin = null
  hover = null
  dragging = false
  typed = ''
}

function commit(start: Vec2, end: Vec2): boolean {
  if (Math.abs(end.x - start.x) < MIN_SIDE || Math.abs(end.y - start.y) < MIN_SIDE) return false
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
  return true
}

registerTool({
  id: 'room-rect',
  label: 'Room',
  shortcut: 'R',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<rect x="4" y="5" width="16" height="14" rx="1"/>'),
  activate() {
    reset()
  },
  deactivate() {
    reset()
  },
  onPointerDown(ctx) {
    if (ctx.button === 2) {
      reset()
      return
    }
    if (origin && !dragging) {
      const start = origin
      if (commit(start, ctx.point)) reset()
      return
    }
    origin = { ...ctx.point }
    hover = { ...ctx.point }
    dragging = true
    typed = ''
  },
  onPointerMove(ctx) {
    if (origin) hover = { ...ctx.point }
  },
  onPointerUp(ctx) {
    if (!dragging || !origin) return
    dragging = false
    if (commit(origin, ctx.point)) reset()
    // Too small to be a drag: keep the corner and wait for a second click or a typed size.
  },
  onKeyDown(ctx) {
    if (!origin) return
    if (ctx.key === 'Escape') {
      reset()
      ctx.handled = true
      return
    }
    if (ctx.key === 'Backspace' && typed.length > 0) {
      typed = typed.slice(0, -1)
      ctx.handled = true
      return
    }
    if (ctx.key === 'Enter') {
      ctx.handled = true
      const size = parseSize(typed, useStore.getState().project.units)
      if (!size) return
      const start = origin
      if (commit(start, typedCorner(start, hover ?? start, size))) reset()
      return
    }
    const next = typeKey(typed, ctx.key, true)
    if (next != null) {
      typed = next
      ctx.handled = true
    }
  },
  drawOverlay(ctx2d, ctx) {
    const preview = roomRectPreview()
    if (!preview) return
    const units = useStore.getState().project.units
    const size = typed ? parseSize(typed, units) : null
    const corner = size ? typedCorner(preview.origin, preview.hover, size) : preview.hover
    const a = ctx.transform.worldToScreen(preview.origin)
    const b = ctx.transform.worldToScreen(corner)
    ctx2d.save()
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.lineWidth = 1.5
    ctx2d.setLineDash([5, 4])
    ctx2d.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    ctx2d.setLineDash([])
    const w = Math.abs(corner.x - preview.origin.x)
    const d = Math.abs(corner.y - preview.origin.y)
    const cursor = ctx.transform.worldToScreen(preview.hover)
    ctx2d.font = '12px ui-sans-serif, system-ui, sans-serif'
    ctx2d.fillStyle = '#1b2422'
    ctx2d.fillText(`${formatLength(w, units)} × ${formatLength(d, units)}`, cursor.x + 14, cursor.y + 6)
    const hint = typed ? `${typed} ↵` : translate(useSettings.getState().language, 'Type width × depth, then Enter')
    ctx2d.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx2d.fillStyle = typed ? '#1b2422' : 'rgba(27, 36, 34, 0.6)'
    ctx2d.fillText(hint, cursor.x + 14, cursor.y + 22)
    ctx2d.restore()
  },
})
