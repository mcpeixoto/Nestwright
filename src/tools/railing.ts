import { dist } from '../model/geometry'
import { addWallChain } from '../model/ops'
import type { Vec2 } from '../model/types'
import { formatLength } from '../model/units'
import { useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'
import { chainFinish, chainPointerDown, initialChain, type ChainState } from './wallChain'

let chain: ChainState = initialChain()
let hover: Vec2 | null = null

function commit(points: Vec2[]) {
  chain = initialChain()
  const drawn = points
  hover = null
  if (drawn.length < 2) return
  const id = useStore.getState().activeLevelId
  useStore.getState().apply('Draw railing', (draft) => {
    const level = draft.levels.find((item) => item.id === id)
    if (!level) return
    addWallChain(level, drawn, {
      kind: 'railing',
      height: 1,
      thickness: 0.08,
      left: { id: 'metal-black' },
      right: { id: 'metal-black' },
    })
  })
}

registerTool({
  id: 'railing',
  label: 'Railing',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<path d="M4 16V8M20 16V8M4 9h16M8 16V9M12 16V9M16 16V9"/>'),
  activate() {
    chain = initialChain()
    hover = null
  },
  deactivate() {
    const step = chainFinish(chain, Date.now())
    chain = step.state
    if (step.commit) commit(step.commit)
    hover = null
  },
  snapAnchor() {
    return chain.points[chain.points.length - 1] ?? null
  },
  onPointerMove(ctx) {
    hover = { ...ctx.point }
  },
  onPointerDown(ctx) {
    if (ctx.button !== 0) return
    const step = chainPointerDown(chain, ctx.point, Date.now())
    chain = step.state
    if (step.commit) commit(step.commit)
  },
  onPointerUp(ctx) {
    if (ctx.button !== 2) return
    const step = chainFinish(chain, Date.now())
    chain = step.state
    if (step.commit) commit(step.commit)
  },
  onKeyDown(ctx) {
    if (ctx.key === 'Enter' || ctx.key === 'Escape') {
      const step = chainFinish(chain, Date.now())
      chain = step.state
      if (step.commit) commit(step.commit)
      ctx.handled = true
    }
  },
  drawOverlay(ctx2d, ctx) {
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
    if (a && hover) {
      const mid = ctx.transform.worldToScreen({ x: (a.x + hover.x) / 2, y: (a.y + hover.y) / 2 })
      ctx2d.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx2d.fillStyle = '#1b2422'
      ctx2d.fillText(formatLength(dist(a, hover), useStore.getState().project.units), mid.x + 8, mid.y - 6)
    }
    ctx2d.restore()
  },
})
