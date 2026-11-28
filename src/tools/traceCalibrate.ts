import { fill, translate } from '../i18n'
import { dist } from '../model/geometry'
import { calibrateTrace } from '../model/trace'
import type { Vec2 } from '../model/types'
import { parseLength } from '../model/units'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'
import { typeKey } from './typedInput'

let pointA: Vec2 | null = null
let pointB: Vec2 | null = null
let hover: Vec2 | null = null
let typed = ''

function reset(): void {
  pointA = null
  pointB = null
  hover = null
  typed = ''
}

function formatScale(metresPerPixel: number): string {
  if (!(metresPerPixel > 0) || !Number.isFinite(metresPerPixel)) return '—'
  const digits = metresPerPixel >= 1 ? 2 : Math.min(6, Math.ceil(-Math.log10(metresPerPixel)) + 2)
  const fixed = metresPerPixel.toFixed(digits)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}

function applyDistance(): void {
  if (!pointA || !pointB) return
  const language = useSettings.getState().language
  const parsed = parseLength(typed, useStore.getState().project.units)
  if (parsed == null) {
    useStore.getState().setMessage(translate(language, 'Not a valid length'))
    return
  }
  const levelId = useStore.getState().activeLevelId
  const current = useStore.getState().project.traces.find((item) => item.levelId === levelId)
  if (!current) {
    reset()
    useStore.getState().setTool('select')
    return
  }
  const next = calibrateTrace(current, pointA, pointB, parsed)
  if (next === current) {
    useStore.getState().setMessage(translate(language, 'Not a valid length'))
    return
  }
  useStore.getState().apply('Calibrate trace', (draft) => {
    const found = draft.traces.find((item) => item.levelId === levelId)
    if (!found) return
    found.scale = next.scale
    found.origin = { ...next.origin }
    found.calibrated = true
  })
  reset()
  useStore.getState().setMessage(fill(language, 'Trace scale {scale} m per pixel', { scale: formatScale(next.scale) }))
  useStore.getState().setTool('select')
}

export function startTraceCalibration(): void {
  reset()
  const state = useStore.getState()
  if (state.tool !== 'trace-calibrate') state.setTool('trace-calibrate')
}

registerTool({
  id: 'trace-calibrate',
  label: 'Set scale',
  group: 'measure',
  hidden: true,
  cursor: 'crosshair',
  icon: icon('<path d="M4 16l14-8M7 14h.01M11 11.5h.01M15 9h.01"/>'),
  activate() {
    reset()
  },
  deactivate() {
    reset()
  },
  onPointerMove(ctx) {
    hover = { ...ctx.raw }
  },
  onPointerDown(ctx) {
    if (pointB) return
    const point = { ...ctx.raw }
    if (!pointA) {
      pointA = point
      hover = point
      typed = ''
      return
    }
    if (dist(pointA, point) < 1e-4) return
    pointB = point
    typed = ''
  },
  onKeyDown(ctx) {
    if (ctx.key === 'Escape') {
      reset()
      ctx.handled = true
      useStore.getState().setTool('select')
      return
    }
    if (!pointA || !pointB) return
    if (ctx.key === 'Enter') {
      ctx.handled = true
      applyDistance()
      return
    }
    if (ctx.key === 'Backspace' && typed.length > 0) {
      typed = typed.slice(0, -1)
      ctx.handled = true
      return
    }
    const next = typeKey(typed, ctx.key)
    if (next != null) {
      typed = next
      ctx.handled = true
    }
  },
  drawOverlay(ctx2d, ctx) {
    if (!pointA) return
    const end = pointB ?? hover ?? ctx.raw
    const a = ctx.transform.worldToScreen(pointA)
    const b = ctx.transform.worldToScreen(end)
    ctx2d.save()
    ctx2d.strokeStyle = '#e8b86d'
    ctx2d.lineWidth = 1.5
    ctx2d.setLineDash([5, 4])
    ctx2d.beginPath()
    ctx2d.moveTo(a.x, a.y)
    ctx2d.lineTo(b.x, b.y)
    ctx2d.stroke()
    ctx2d.setLineDash([])
    ctx2d.fillStyle = '#e8b86d'
    for (const p of [a, b]) {
      ctx2d.beginPath()
      ctx2d.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
      ctx2d.fill()
    }
    if (pointB) {
      const hint = typed
        ? `${typed} ↵`
        : translate(useSettings.getState().language, 'Type the real distance, then Enter')
      ctx2d.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx2d.fillStyle = typed ? '#1b2422' : 'rgba(27, 36, 34, 0.72)'
      ctx2d.fillText(hint, ctx.screen.x + 14, ctx.screen.y + 22)
    }
    ctx2d.restore()
  },
})
