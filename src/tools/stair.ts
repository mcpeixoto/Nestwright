import { newId } from '../model/ids'
import { computeStairSteps } from '../model/stairs'
import type { Stair, Vec2 } from '../model/types'
import { selectActiveLevel, useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'

let draft: { anchor: Vec2; rotation: number } | null = null

registerTool({
  id: 'stair',
  label: 'Stair',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<path d="M4 18h4v-4h4V10h4V6h4"/>'),
  onPointerDown(ctx) {
    if (ctx.button !== 0) return
    draft = { anchor: { ...ctx.point }, rotation: 0 }
  },
  onPointerMove(ctx) {
    if (!draft) return
    const dx = ctx.point.x - draft.anchor.x
    const dy = ctx.point.y - draft.anchor.y
    if (Math.hypot(dx, dy) > 0.12) draft.rotation = Math.atan2(dy, dx)
  },
  onPointerUp(ctx) {
    if (!draft || ctx.button !== 0) return
    const placed = draft
    draft = null
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    if (!level) return
    const id = level.id
    const rise = level.height > 0.05 ? level.height : 2.7
    let created = ''
    state.apply('Add stair', (project) => {
      const target = project.levels.find((item) => item.id === id)
      if (!target) return
      created = newId('stair')
      target.stairs.push({
        id: created,
        shape: 'straight',
        position: { ...placed.anchor },
        rotation: placed.rotation,
        width: 1,
        rise,
        turnLeft: true,
        material: { id: 'oak-planks' },
        railing: true,
      })
    })
    if (created) useStore.getState().select([created])
  },
  deactivate() {
    draft = null
  },
  drawOverlay(ctx2d, ctx) {
    if (!draft) return
    const level = selectActiveLevel(useStore.getState())
    const stair: Stair = {
      id: 'preview',
      shape: 'straight',
      position: draft.anchor,
      rotation: draft.rotation,
      width: 1,
      rise: level?.height ?? 2.7,
      material: { id: 'oak-planks' },
      railing: false,
    }
    const layout = computeStairSteps(stair, level?.height ?? 2.7)
    ctx2d.save()
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.lineWidth = 1.5
    for (const step of layout.steps) strokeRing(ctx2d, ctx.transform.worldToScreen, step.polygon)
    ctx2d.restore()
  },
})

function strokeRing(
  ctx2d: CanvasRenderingContext2D,
  worldToScreen: (p: Vec2) => { x: number; y: number },
  ring: readonly Vec2[],
) {
  if (ring.length < 2) return
  ctx2d.beginPath()
  const first = worldToScreen(ring[0]!)
  ctx2d.moveTo(first.x, first.y)
  for (const p of ring.slice(1)) {
    const s = worldToScreen(p)
    ctx2d.lineTo(s.x, s.y)
  }
  ctx2d.closePath()
  ctx2d.stroke()
}
