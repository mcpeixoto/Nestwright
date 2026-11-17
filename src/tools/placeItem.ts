import { getEntry } from '../catalog/registry'
import type { CatalogEntry } from '../catalog/types'
import { newId } from '../model/ids'
import { resolveItemPose } from '../model/itemCollision'
import { addItem } from '../model/ops'
import { nearestWallPoint } from '../model/rooms'
import { itemCorners } from '../plan2d/snap'
import type { Level, Vec2 } from '../model/types'
import { selectActiveLevel, useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'

let catalogId: string | null = null
let ghost: { position: Vec2; rotation: number } | null = null

export function placeGhost(): { catalogId: string; position: Vec2; rotation: number } | null {
  if (!catalogId || !ghost) return null
  return { catalogId, position: ghost.position, rotation: ghost.rotation }
}

export function beginPlace(id: string): void {
  catalogId = id
  ghost = null
  useStore.getState().setTool('place-item')
}

function elevationFor(id: string, entry: CatalogEntry, level: Level): number {
  return entry.mount === 'ceiling' || id === 'pendant-lamp'
    ? Math.max(0, level.height - entry.defaultSize.h)
    : entry.mount === 'wall'
      ? Math.max(0, Math.min(entry.mountHeight ?? 1.45, level.height - entry.defaultSize.h))
      : 0
}

function wallPose(point: Vec2, entry: CatalogEntry, level: Level): { position: Vec2; rotation: number } {
  const near = nearestWallPoint(level, point)
  const reach = entry.againstWall ? Math.max(1.4, entry.defaultSize.d + 0.8) : 0.45 + entry.defaultSize.d
  if (!near || near.distance > reach) return { position: point, rotation: 0 }
  const dx = point.x - near.point.x
  const dy = point.y - near.point.y
  const mag = Math.hypot(dx, dy) || 1
  const nx = dx / mag
  const ny = dy / mag
  const gap = near.wall.thickness / 2 + entry.defaultSize.d / 2
  return {
    position: { x: near.point.x + nx * gap, y: near.point.y + ny * gap },
    rotation: Math.atan2(-nx, ny),
  }
}

/** Where a click at `point` drops the item; unless `free` (Alt), pushed clear of walls and furniture. */
function poseAt(point: Vec2, free: boolean): { position: Vec2; rotation: number } {
  const level = selectActiveLevel(useStore.getState())
  const id = catalogId
  const entry = id ? getEntry(id) : undefined
  if (!level || !entry || !id) return { position: point, rotation: 0 }
  const pose = wallPose(point, entry, level)
  if (free) return pose
  const resolved = resolveItemPose(level, {
    ...pose,
    size: entry.defaultSize,
    elevation: elevationFor(id, entry, level),
    catalogId: id,
  })
  return { position: resolved.position, rotation: pose.rotation }
}

registerTool({
  id: 'place-item',
  label: 'Place',
  group: 'interior',
  cursor: 'copy',
  icon: icon('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  activate() {
    ghost = null
  },
  deactivate() {
    catalogId = null
    ghost = null
  },
  onPointerMove(ctx) {
    if (!catalogId) return
    ghost = poseAt(ctx.point, ctx.alt)
  },
  onPointerDown(ctx) {
    if (!catalogId) return
    const entry = getEntry(catalogId)
    const level = selectActiveLevel(useStore.getState())
    if (!entry || !level) return
    const pose = poseAt(ctx.point, ctx.alt)
    const id = catalogId
    const levelId = level.id
    const elevation = elevationFor(id, entry, level)
    useStore.getState().apply('Place item', (draft) => {
      const target = draft.levels.find((l) => l.id === levelId)
      if (!target) return
      addItem(target, {
        id: newId('item'),
        catalogId: id,
        position: pose.position,
        elevation,
        rotation: pose.rotation,
        size: { ...entry.defaultSize },
        materials: Object.fromEntries(Object.entries(entry.materialSlots).map(([key, value]) => [key, { ...value }])),
        params: {},
        price: entry.price,
        lightOn: entry.light ? true : undefined,
      })
    })
    ghost = pose
  },
  onKeyDown(ctx) {
    if (ctx.key === 'Escape') {
      catalogId = null
      ghost = null
      useStore.getState().setTool('select')
      ctx.handled = true
    }
  },
  drawOverlay(ctx2d, ctx) {
    const pose = placeGhost()
    if (!pose) return
    const entry = getEntry(pose.catalogId)
    if (!entry) return
    const corners = itemCorners(pose.position, entry.defaultSize.w, entry.defaultSize.d, pose.rotation)
    ctx2d.save()
    ctx2d.fillStyle = 'rgba(63, 184, 175, 0.35)'
    ctx2d.strokeStyle = '#3FB8AF'
    ctx2d.beginPath()
    const first = ctx.transform.worldToScreen(corners[0]!)
    ctx2d.moveTo(first.x, first.y)
    for (const corner of corners.slice(1)) {
      const s = ctx.transform.worldToScreen(corner)
      ctx2d.lineTo(s.x, s.y)
    }
    ctx2d.closePath()
    ctx2d.fill()
    ctx2d.stroke()
    ctx2d.restore()
  },
})
