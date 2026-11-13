import { snapToGrid } from '../model/geometry'
import { placeOpening } from '../model/ops'
import type { OpeningType, Vec2 } from '../model/types'
import { findWallAt, locateOnWall, openingFits, pointAlongWall, wallDirection, wallLength } from '../model/walls'
import { createOpening } from '../model/defaults'
import { selectActiveLevel, useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'
import type { ToolContext } from './types'

export const DOOR_TYPES: OpeningType[] = ['door', 'double-door', 'sliding-door', 'garage-door', 'arch']
export const WINDOW_TYPES: OpeningType[] = ['window', 'fixed-window', 'tall-window', 'round-window', 'corner-window']

export interface OpeningPreview {
  wallId: string
  offset: number
  point: Vec2
}

let preview: OpeningPreview | null = null

export function openingPreview(): OpeningPreview | null {
  return preview
}

function hoverWall(ctx: ToolContext, types: readonly OpeningType[]) {
  const level = selectActiveLevel(useStore.getState())
  preview = null
  if (!level) return
  const wall = findWallAt(level, ctx.point, 0.35)
  if (!wall) return
  const loc = locateOnWall(wall, ctx.point)
  const subtype = useStore.getState().openingSubtype
  const type = types.includes(subtype) ? subtype : types[0]
  if (!type) return
  const draft = createOpening(type, wall.id, loc.distance)
  const length = wallLength(wall)
  let offset = snapToGrid({ x: loc.distance, y: 0 }, 0.05).x
  offset = Math.min(Math.max(offset, draft.width / 2), Math.max(draft.width / 2, length - draft.width / 2))
  const opening = createOpening(type, wall.id, offset)
  if (!openingFits(wall, opening, level.openings)) return
  preview = { wallId: wall.id, offset, point: loc.point }
}

function registerOpening(id: string, label: string, shortcut: string, types: OpeningType[], glyph: string) {
  registerTool({
    id,
    label,
    shortcut,
    group: 'openings',
    cursor: 'crosshair',
    icon: icon(glyph),
    activate() {
      const current = useStore.getState().openingSubtype
      if (!types.includes(current)) useStore.getState().setOpeningSubtype(types[0] ?? current)
      preview = null
    },
    deactivate() {
      preview = null
    },
    onPointerMove(ctx) {
      hoverWall(ctx, types)
    },
    onPointerDown(ctx) {
      hoverWall(ctx, types)
      const hit = preview
      if (!hit) return
      const levelId = useStore.getState().activeLevelId
      const type = useStore.getState().openingSubtype
      useStore.getState().apply(id === 'door' ? 'Place door' : 'Place window', (draft) => {
        const level = draft.levels.find((l) => l.id === levelId)
        if (level) placeOpening(level, type, hit.wallId, hit.offset)
      })
    },
    drawOverlay(ctx2d, ctx) {
      const hit = preview
      const level = selectActiveLevel(useStore.getState())
      if (!hit || !level) return
      const wall = level.walls.find((item) => item.id === hit.wallId)
      if (!wall) return
      const subtype = useStore.getState().openingSubtype
      const type = types.includes(subtype) ? subtype : types[0]
      if (!type) return
      const width = createOpening(type, wall.id, hit.offset).width
      const dir = wallDirection(wall)
      const a = pointAlongWall(wall, hit.offset - width / 2)
      const b = pointAlongWall(wall, hit.offset + width / 2)
      const n = { x: -dir.y * (wall.thickness / 2 + 0.02), y: dir.x * (wall.thickness / 2 + 0.02) }
      const poly = [
        { x: a.x + n.x, y: a.y + n.y },
        { x: b.x + n.x, y: b.y + n.y },
        { x: b.x - n.x, y: b.y - n.y },
        { x: a.x - n.x, y: a.y - n.y },
      ]
      ctx2d.save()
      ctx2d.fillStyle = 'rgba(232, 184, 109, 0.85)'
      ctx2d.beginPath()
      const first = ctx.transform.worldToScreen(poly[0]!)
      ctx2d.moveTo(first.x, first.y)
      for (const p of poly.slice(1)) {
        const s = ctx.transform.worldToScreen(p)
        ctx2d.lineTo(s.x, s.y)
      }
      ctx2d.closePath()
      ctx2d.fill()
      ctx2d.restore()
    },
  })
}

registerOpening('door', 'Door', 'D', DOOR_TYPES, '<path d="M7 20V4h8v16M15 12h1"/>')
registerOpening('window', 'Window', 'N', WINDOW_TYPES, '<rect x="5" y="6" width="14" height="12"/><path d="M12 6v12M5 12h14"/>')
