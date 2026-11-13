import { dist } from '../model/geometry'
import { newId } from '../model/ids'
import type { Vec2 } from '../model/types'
import { useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'
import { chainFinish, chainPointerDown, initialChain, type ChainState } from './wallChain'

let chain: ChainState = initialChain()
let hover: Vec2 | null = null

function commit(points: Vec2[]) {
  const ring = openRing(points)
  chain = initialChain()
  hover = null
  if (ring.length < 3) return
  const id = useStore.getState().activeLevelId
  let created = ''
  useStore.getState().apply('Add slab', (draft) => {
    const level = draft.levels.find((item) => item.id === id)
    if (!level) return
    created = newId('slab')
    level.slabs.push({
      id: created,
      polygon: ring,
      thickness: 0.18,
      top: 0,
      material: { id: 'concrete' },
    })
  })
  if (created) useStore.getState().select([created])
}

function openRing(points: Vec2[]): Vec2[] {
  if (points.length < 3) return []
  const first = points[0]
  const last = points[points.length - 1]
  const body = first && last && dist(first, last) < 1e-3 ? points.slice(0, -1) : points
  return body.length >= 3 ? body.map((p) => ({ x: p.x, y: p.y })) : []
}

registerTool({
  id: 'slab',
  label: 'Slab',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<path d="M4 16 L8 8 h8 l4 8 z"/>'),
  activate() {
    chain = initialChain()
    hover = null
  },
  deactivate() {
    if (chain.points.length >= 3) commit([...chain.points, chain.points[0]!])
    else chain = initialChain()
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
    if (ctx.button === 2 && chain.points.length >= 3) commit([...chain.points, chain.points[0]!])
  },
  onKeyDown(ctx) {
    if (ctx.key === 'Enter' && chain.points.length >= 3) {
      commit([...chain.points, chain.points[0]!])
      ctx.handled = true
    } else if (ctx.key === 'Escape') {
      chain = chainFinish(chain, Date.now()).state
      hover = null
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
    ctx2d.restore()
  },
})
