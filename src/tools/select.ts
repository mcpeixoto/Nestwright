import { bulgeDelta, clampBulge, curveHandle } from '../model/curve'
import { snapItemPose, type SnapGuide } from '../model/furnitureSnap'
import { add, dist, len, sub } from '../model/geometry'
import { traceContains } from '../model/trace'
import { moveItems, moveRoom, moveWall, moveWallEndpoint } from '../model/ops'
import { slideOpening } from '../model/ops/sizes'
import { roomAt } from '../model/rooms'
import type { Item, Level, Opening, Vec2, Wall } from '../model/types'
import { pickOutside } from '../model/terrain'
import { findWallAt, locateOnWall, openingInterval, pointAlongWall } from '../model/walls'
import { pointInItem, screenTol } from '../plan2d/snap'
import { structureAt } from '../plan2d/structureHit'
import { selectActiveLevel, useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'

type Drag =
  | { kind: 'items'; ids: string[]; origins: { id: string; position: Vec2; rotation: number }[]; start: Vec2 }
  | { kind: 'end'; wallId: string; end: 'a' | 'b'; origin: Vec2; start: Vec2 }
  | { kind: 'wall'; wallId: string; originA: Vec2; start: Vec2 }
  | { kind: 'bulge'; wallId: string; origin: number; start: Vec2 }
  | { kind: 'room'; roomKey: string; start: Vec2 }
  | { kind: 'opening'; openingId: string; wallId: string; grab: number }
  | { kind: 'trace'; origin: Vec2; start: Vec2; screenX: number; screenY: number; active: boolean }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean }

let drag: Drag | null = null
let guides: SnapGuide[] = []

/** Snap guides of the item drag in progress, in plan coordinates. */
export function itemSnapGuides(): readonly SnapGuide[] {
  return guides
}

function levelOf(): Level | undefined {
  return selectActiveLevel(useStore.getState())
}

function hitEndpoint(level: Level, point: Vec2, selection: readonly string[], zoom: number) {
  const tol = screenTol(zoom, 12)
  let best: { wallId: string; end: 'a' | 'b' } | null = null
  let bestD = tol
  for (const wall of level.walls) {
    if (!selection.includes(wall.id)) continue
    for (const end of ['a', 'b'] as const) {
      const d = dist(point, wall[end])
      if (d <= bestD) {
        best = { wallId: wall.id, end }
        bestD = d
      }
    }
  }
  return best
}

function hitItem(level: Level, point: Vec2): Item | null {
  for (let i = level.items.length - 1; i >= 0; i--) {
    const item = level.items[i]
    if (!item) continue
    if (pointInItem(point, item.position, item.size.w, item.size.d, item.rotation)) return item
  }
  return null
}

function hitOpening(level: Level, point: Vec2): Opening | null {
  let best: Opening | null = null
  let bestD = Infinity
  for (const opening of level.openings) {
    const wall = level.walls.find((w) => w.id === opening.wallId)
    if (!wall) continue
    const loc = locateOnWall(wall, point)
    if (loc.distanceToWall > wall.thickness / 2 + 0.12) continue
    const span = openingInterval(wall, opening)
    if (loc.distance < span.start - 0.05 || loc.distance > span.end + 0.05) continue
    const d = dist(point, pointAlongWall(wall, opening.offset))
    if (d < bestD) {
      best = opening
      bestD = d
    }
  }
  return best
}

function applyMove(label: string, recipe: (level: Level) => void) {
  const id = useStore.getState().activeLevelId
  useStore.getState().apply(label, (draft) => {
    const level = draft.levels.find((l) => l.id === id)
    if (level) recipe(level)
  })
}

export function marqueeRect(): { x0: number; y0: number; x1: number; y1: number } | null {
  if (drag?.kind !== 'marquee') return null
  return drag
}

function pickMarquee(level: Level, a: Vec2, b: Vec2): string[] {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  const inside = (p: Vec2) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  const ids: string[] = []
  for (const item of level.items) if (inside(item.position)) ids.push(item.id)
  for (const wall of level.walls) {
    const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
    if (inside(wall.a) || inside(wall.b) || inside(mid)) ids.push(wall.id)
  }
  for (const opening of level.openings) {
    const wall = level.walls.find((w) => w.id === opening.wallId)
    if (wall && inside(pointAlongWall(wall, opening.offset))) ids.push(opening.id)
  }
  return ids
}

registerTool({
  id: 'select',
  label: 'Select',
  shortcut: 'V',
  group: 'build',
  cursor: 'default',
  icon: icon('<path d="M5 3l5 16 2.2-6.2L19 11z"/>'),
  deactivate() {
    drag = null
    guides = []
    useStore.getState().endStroke()
  },
  onPointerDown(ctx) {
    const level = levelOf()
    if (!level) return
    const state = useStore.getState()
    const end = hitEndpoint(level, ctx.point, state.selection, ctx.transform.zoom)
    if (end) {
      const wall = level.walls.find((w) => w.id === end.wallId)
      if (!wall) return
      drag = { kind: 'end', wallId: end.wallId, end: end.end, origin: { ...wall[end.end] }, start: { ...ctx.point } }
      return
    }
    const item = hitItem(level, ctx.point)
    if (item) {
      const already = state.selection.includes(item.id)
      if (ctx.shift) state.select([item.id], true)
      else if (!already) state.select([item.id])
      const selected = useStore.getState().selection
      const ids = (already && !ctx.shift ? selected : [item.id]).filter((id) => level.items.some((it) => it.id === id))
      drag = {
        kind: 'items',
        ids,
        origins: ids.map((id) => {
          const found = level.items.find((it) => it.id === id)
          return { id, position: found ? { ...found.position } : { x: 0, y: 0 }, rotation: found?.rotation ?? 0 }
        }),
        start: { ...ctx.point },
      }
      useStore.getState().beginStroke('Move items')
      return
    }
    const opening = hitOpening(level, ctx.point)
    if (opening) {
      state.select([opening.id], ctx.shift)
      const host = level.walls.find((w) => w.id === opening.wallId)
      if (host && !ctx.shift) {
        drag = {
          kind: 'opening',
          openingId: opening.id,
          wallId: host.id,
          grab: locateOnWall(host, ctx.point).distance - opening.offset,
        }
        useStore.getState().beginStroke('Move opening')
      }
      return
    }
    const curved = hitBulge(level, ctx.point, state.selection, ctx.transform.zoom)
    if (curved) {
      state.select([curved.id], ctx.shift)
      drag = { kind: 'bulge', wallId: curved.id, origin: curved.bulge, start: { ...ctx.point } }
      return
    }
    const wall = findWallAt(level, ctx.point, 0.08)
    if (wall) {
      state.select([wall.id], ctx.shift)
      drag = { kind: 'wall', wallId: wall.id, originA: { ...wall.a }, start: { ...ctx.point } }
      return
    }
    const structure = structureAt(level, ctx.point, ctx.transform.zoom)
    if (structure) {
      state.select([structure], ctx.shift)
      return
    }
    const terrain = state.project.terrain
    const outside = terrain ? pickOutside(terrain, ctx.point, screenTol(ctx.transform.zoom, 8)) : null
    if (outside) {
      state.select([outside], ctx.shift)
      return
    }
    const room = roomAt(level, ctx.point)
    if (room) {
      const already = state.selection.includes(room.key)
      if (already && !ctx.shift) {
        drag = { kind: 'room', roomKey: room.key, start: { ...ctx.point } }
        useStore.getState().beginStroke('Move room')
      } else state.select([room.key], ctx.shift)
      return
    }
    const trace = state.project.traces.find((item) => item.levelId === level.id)
    if (trace && trace.visible !== false && trace.locked !== true && traceContains(trace, ctx.point)) {
      drag = {
        kind: 'trace',
        origin: { ...trace.origin },
        start: { ...ctx.point },
        screenX: ctx.screen.x,
        screenY: ctx.screen.y,
        active: false,
      }
      return
    }
    if (!ctx.shift) state.select([])
    drag = { kind: 'marquee', x0: ctx.screen.x, y0: ctx.screen.y, x1: ctx.screen.x, y1: ctx.screen.y, additive: ctx.shift }
  },
  onPointerMove(ctx) {
    const level = levelOf()
    if (!drag || !level) return
    if (drag.kind === 'marquee') {
      drag.x1 = ctx.screen.x
      drag.y1 = ctx.screen.y
      return
    }
    if (drag.kind === 'items') {
      const ids = drag.ids
      const delta = sub(ctx.alt ? ctx.raw : ctx.point, drag.start)
      const origin = drag.origins[0]
      if (!origin) return
      const firstNow = level.items.find((item) => item.id === origin.id)
      if (!firstNow) return
      const single = ids.length === 1 && !firstNow.locked
      const snapped = snapItemPose(
        level,
        { position: add(origin.position, delta), rotation: single ? origin.rotation : firstNow.rotation, size: firstNow.size },
        { snap: !ctx.alt, ignore: ids, rotate: single },
      )
      guides = snapped.guides
      applyMove('Move items', (draft) => {
        const first = draft.items.find((item) => item.id === origin.id)
        if (!first) return
        const step = sub(snapped.position, first.position)
        if (len(step) >= 1e-6) moveItems(draft, ids, step)
        if (single && Math.abs(first.rotation - snapped.rotation) > 1e-9) first.rotation = snapped.rotation
      })
      return
    }
    if (drag.kind === 'end') {
      const wallId = drag.wallId
      const end = drag.end
      const target = add(drag.origin, sub(ctx.point, drag.start))
      applyMove('Move wall', (draft) => moveWallEndpoint(draft, wallId, end, target))
      return
    }
    if (drag.kind === 'bulge') {
      const wallId = drag.wallId
      const origin = drag.origin
      const start = drag.start
      const point = ctx.point
      applyMove('Curve wall', (draft) => {
        const wall = draft.walls.find((item) => item.id === wallId)
        if (!wall) return
        wall.bulge = clampBulge(wall, origin + bulgeDelta(wall, start, point))
      })
      return
    }
    if (drag.kind === 'opening') {
      const { openingId, wallId, grab } = drag
      const host = level.walls.find((w) => w.id === wallId)
      const current = level.openings.find((o) => o.id === openingId)
      if (!host || !current) return
      const target = locateOnWall(host, ctx.point).distance - grab
      if (Math.abs(target - current.offset) < 1e-4) return
      applyMove('Move opening', (draft) => {
        slideOpening(draft, openingId, target)
      })
      return
    }
    if (drag.kind === 'room') {
      const roomKey = drag.roomKey
      const delta = sub(ctx.point, drag.start)
      if (len(delta) < 1e-6) return
      drag.start = { ...ctx.point }
      applyMove('Move room', (draft) => moveRoom(draft, roomKey, delta))
      return
    }
    if (drag.kind === 'trace') {
      if (!drag.active) {
        if (Math.hypot(ctx.screen.x - drag.screenX, ctx.screen.y - drag.screenY) < 4) return
        drag.active = true
        useStore.getState().select([])
        useStore.getState().beginStroke('Move trace')
      }
      const levelId = useStore.getState().activeLevelId
      const origin = add(drag.origin, sub(ctx.point, drag.start))
      useStore.getState().apply('Move trace', (draft) => {
        const found = draft.traces.find((item) => item.levelId === levelId)
        if (!found || found.locked) return
        found.origin = { x: origin.x, y: origin.y }
      })
      return
    }
    if (drag.kind === 'wall') {
      const wallId = drag.wallId
      const originA = drag.originA
      const start = drag.start
      const point = ctx.point
      applyMove('Move wall', (draft) => {
        const wall = draft.walls.find((w) => w.id === wallId)
        if (!wall) return
        const step = sub(add(originA, sub(point, start)), wall.a)
        if (len(step) < 1e-6) return
        moveWall(draft, wall.id, step)
      })
    }
  },
  onPointerUp(ctx) {
    const current = drag
    drag = null
    guides = []
    if (current?.kind === 'trace') {
      if (!current.active && !ctx.shift) useStore.getState().select([])
      useStore.getState().endStroke()
      return
    }
    if (current?.kind === 'room' || current?.kind === 'opening' || current?.kind === 'items') {
      useStore.getState().endStroke()
      return
    }
    if (!current || current.kind !== 'marquee') return
    if (Math.hypot(current.x1 - current.x0, current.y1 - current.y0) < 4) return
    const level = levelOf()
    if (!level) return
    const a = ctx.transform.screenToWorld(current.x0, current.y0)
    const b = ctx.transform.screenToWorld(current.x1, current.y1)
    const ids = pickMarquee(level, a, b)
    if (current.additive) useStore.getState().select([...useStore.getState().selection, ...ids])
    else useStore.getState().select(ids)
  },
  drawOverlay(ctx2d, ctx) {
    if (guides.length > 0) {
      ctx2d.save()
      ctx2d.strokeStyle = '#e0568a'
      ctx2d.lineWidth = 1
      ctx2d.setLineDash([5, 4])
      for (const guide of guides) {
        const a = ctx.transform.worldToScreen(guide.a)
        const b = ctx.transform.worldToScreen(guide.b)
        ctx2d.beginPath()
        ctx2d.moveTo(a.x, a.y)
        ctx2d.lineTo(b.x, b.y)
        ctx2d.stroke()
      }
      ctx2d.restore()
    }
    const rect = marqueeRect()
    if (!rect) return
    const x = Math.min(rect.x0, rect.x1)
    const y = Math.min(rect.y0, rect.y1)
    const w = Math.abs(rect.x1 - rect.x0)
    const h = Math.abs(rect.y1 - rect.y0)
    ctx2d.save()
    ctx2d.fillStyle = 'rgba(63, 184, 175, 0.15)'
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.lineWidth = 1
    ctx2d.fillRect(x, y, w, h)
    ctx2d.strokeRect(x, y, w, h)
    ctx2d.restore()
  },
})

function hitBulge(level: Level, point: Vec2, selection: readonly string[], zoom: number): Wall | null {
  const tol = screenTol(zoom, 10)
  for (const wall of level.walls) {
    if (!selection.includes(wall.id) || wall.kind === 'railing') continue
    if (dist(point, curveHandle(wall)) <= tol) return wall
  }
  return null
}

export function selectedWalls(level: Level, selection: readonly string[]): Wall[] {
  return level.walls.filter((wall) => selection.includes(wall.id))
}
