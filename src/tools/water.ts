import { polygonArea, polygonCentroid } from '../model/geometry'
import { newId } from '../model/ids'
import { carveBasin, paintShore, sampleHeight, waterDepth } from '../model/terrain'
import type { Vec2 } from '../model/types'
import { useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { getBrush } from './brushState'
import { createChain, strokeChain, type ChainSnapshot } from './chain'
import { icon } from './icons'
import { registerTool } from './registry'

let anchor: Vec2 | null = null
let drag: Vec2 | null = null
let poolDown = false

function rect(a: Vec2, b: Vec2): Vec2[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ]
}

function commitWater(kind: 'pond' | 'pool' | 'stream', polygon: Vec2[]): void {
  if (kind === 'stream' ? polygon.length < 2 : polygon.length < 3) return
  if (kind !== 'stream' && Math.abs(polygonArea(polygon)) < 0.35) return
  const id = newId('water')
  useStore.getState().apply(kind === 'pool' ? 'Add pool' : kind === 'stream' ? 'Add stream' : 'Add pond', (draft) => {
    const terrain = draft.terrain
    const centroid = polygonCentroid(polygon)
    const surface = kind === 'pool' ? 0 : sampleHeight(terrain, centroid.x, centroid.y) - 0.03
    const depth = waterDepth({ kind })
    draft.terrain.water.push({
      id,
      kind,
      polygon: polygon.map((p) => ({ x: p.x, y: p.y })),
      level: surface,
      depth,
    })
    if (kind === 'pool') carveBasin(terrain, polygon, surface - depth, 0.45)
    else paintShore(terrain, polygon, kind === 'stream' ? 0.7 : 1.15)
  })
  useStore.getState().select([id])
}

const chain = createChain({
  minPoints: 2,
  closeMetres: 0.75,
  onCommit(points) {
    const kind = getBrush().waterKind
    if (kind === 'pool') return
    const first = points[0]
    const last = points[points.length - 1]
    const closed = !!first && !!last && points.length >= 3 && first.x === last.x && first.y === last.y
    const body = closed ? points.slice(0, -1) : points
    commitWater(kind === 'stream' ? 'stream' : 'pond', body)
  },
})

export function waterPreview(): ChainSnapshot & { rect: Vec2[] | null } {
  const snap = chain.snapshot()
  return { ...snap, rect: anchor && drag ? rect(anchor, drag) : null }
}

export function waterPointer(phase: 'down' | 'move' | 'up', point: Vec2): void {
  if (getBrush().waterKind === 'pool') {
    if (phase === 'down') {
      anchor = { ...point }
      drag = { ...point }
      poolDown = true
      return
    }
    if (phase === 'move') {
      drag = { ...point }
      return
    }
    if (poolDown && anchor && drag) commitWater('pool', rect(anchor, drag))
    anchor = null
    drag = null
    poolDown = false
    return
  }
  if (phase === 'down') chain.add(point)
  else if (phase === 'move') chain.hover(point)
  else if (phase === 'up') {
    /* click commits on down; up ends a pool drag only */
  }
}

registerShortcut({
  id: 'tool-water',
  keys: 'y',
  description: 'Water',
  run: () => useStore.getState().setTool('water'),
})

registerTool({
  id: 'water',
  label: 'Water',
  shortcut: 'Y',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<path d="M4 15c2 2 4 2 6 0s4-2 6 0 4 2 4 0"/><path d="M4 19c2 2 4 2 6 0s4-2 6 0 4 2 4 0"/>'),
  activate() {
    chain.reset()
    anchor = null
    drag = null
    poolDown = false
  },
  deactivate() {
    chain.reset()
    anchor = null
    drag = null
  },
  onPointerDown(ctx) {
    waterPointer('down', ctx.point)
  },
  onPointerMove(ctx) {
    waterPointer('move', ctx.point)
  },
  onPointerUp(ctx) {
    waterPointer('up', ctx.point)
  },
  onKeyDown(ctx) {
    if (chain.key(ctx.key)) ctx.handled = true
  },
  drawOverlay(ctx2d, ctx) {
    const preview = waterPreview()
    ctx2d.save()
    ctx2d.strokeStyle = '#2f7f96'
    ctx2d.fillStyle = '#2f7f96'
    ctx2d.lineWidth = 1.5
    if (preview.rect) strokeChain(ctx2d, (p) => ctx.transform.worldToScreen(p), preview.rect, null, true)
    else strokeChain(ctx2d, (p) => ctx.transform.worldToScreen(p), preview.points, preview.hover, false)
    ctx2d.restore()
  },
})
