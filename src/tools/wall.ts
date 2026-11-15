import { dist } from '../model/geometry'
import { addWallChain } from '../model/ops'
import type { Vec2 } from '../model/types'
import { formatLength, parseLength } from '../model/units'
import { translate } from '../i18n'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'
import { chainExtend, chainFinish, chainPointerDown, initialChain, type ChainState } from './wallChain'
import { typeKey } from './typedInput'
import { wallDrawProps } from './wallOptions'

let chain: ChainState = initialChain()
let hover: Vec2 | null = null
let typed = ''

function commitAt(time: number) {
  const step = chainFinish(chain, time)
  chain = step.state
  typed = ''
  if (!step.commit) return
  const points = step.commit
  const id = useStore.getState().activeLevelId
  useStore.getState().apply('Draw walls', (draft) => {
    const level = draft.levels.find((l) => l.id === id)
    if (!level) return
    addWallChain(level, points, wallDrawProps())
  })
}

export function wallChain(): { points: Vec2[]; hover: Vec2 | null; typed: string } {
  return { points: chain.points, hover, typed }
}

registerTool({
  id: 'wall',
  label: 'Wall',
  shortcut: 'W',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<path d="M4 18V6M20 18V6M4 12h16"/>'),
  activate() {
    chain = { ...chain, points: [] }
    hover = null
    typed = ''
  },
  deactivate() {
    commitAt(Date.now())
    hover = null
  },
  snapAnchor() {
    return chain.points.length ? (chain.points[chain.points.length - 1] ?? null) : null
  },
  snapTargets() {
    return chain.points
  },
  onPointerMove(ctx) {
    hover = { ...ctx.point }
  },
  onPointerDown(ctx) {
    const before = chain.points.length
    const step = chainPointerDown(chain, ctx.point, Date.now())
    chain = step.state
    hover = { ...ctx.point }
    if (step.commit || chain.points.length !== before) typed = ''
    if (!step.commit) return
    const points = step.commit
    const id = useStore.getState().activeLevelId
    useStore.getState().apply('Draw walls', (draft) => {
      const level = draft.levels.find((l) => l.id === id)
      if (!level) return
      addWallChain(level, points, wallDrawProps())
    })
  },
  onPointerUp(ctx) {
    if (ctx.button === 2) commitAt(Date.now())
  },
  onKeyDown(ctx) {
    if (ctx.key === 'Escape' || (ctx.key === 'Enter' && typed.length === 0)) {
      commitAt(Date.now())
      ctx.handled = true
      return
    }
    if (ctx.key === 'Enter' && typed.length > 0) {
      const metres = parseLength(typed, useStore.getState().project.units)
      if (metres != null && hover) {
        const next = chainExtend(chain, hover, metres)
        if (next !== chain) {
          chain = next
          typed = ''
        }
      }
      ctx.handled = true
      return
    }
    if (ctx.key === 'Backspace' && typed.length > 0) {
      typed = typed.slice(0, -1)
      ctx.handled = true
      return
    }
    if (chain.points.length === 0) return
    const next = typeKey(typed, ctx.key)
    if (next != null) {
      typed = next
      ctx.handled = true
    }
  },
  drawOverlay(ctx2d, ctx) {
    if (chain.points.length === 0 && !hover) return
    const pts = hover && chain.points.length ? [...chain.points, hover] : chain.points
    if (pts.length === 0) return
    ctx2d.save()
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.lineWidth = 2
    ctx2d.beginPath()
    const first = ctx.transform.worldToScreen(pts[0]!)
    ctx2d.moveTo(first.x, first.y)
    for (const p of pts.slice(1)) {
      const s = ctx.transform.worldToScreen(p)
      ctx2d.lineTo(s.x, s.y)
    }
    ctx2d.stroke()
    const a = chain.points[chain.points.length - 1]
    const b = hover
    if (a && b) {
      const mid = ctx.transform.worldToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      const label = typed ? typed : formatLength(dist(a, b), useStore.getState().project.units)
      ctx2d.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx2d.fillStyle = '#1b2422'
      ctx2d.fillText(label, mid.x + 8, mid.y - 6)
      const cursor = ctx.transform.worldToScreen(b)
      const hint = typed
        ? `${typed} ↵`
        : translate(useSettings.getState().language, 'Type a length, then Enter')
      ctx2d.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx2d.fillStyle = typed ? '#1b2422' : 'rgba(27, 36, 34, 0.6)'
      ctx2d.fillText(hint, cursor.x + 14, cursor.y + 22)
    }
    ctx2d.restore()
  },
})
