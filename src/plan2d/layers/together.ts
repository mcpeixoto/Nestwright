import { paperLabel, strokePoly } from '../draw'
import { registerPlanLayer } from '../layers'
import { itemCorners } from '../snap'
import { unmetRoomKeys } from '../../model/requirements'
import type { Level, Wish } from '../../model/types'
import { REACTION_GLYPH } from '../../model/wishes'
import { wallPolygon } from '../../model/walls'
import { getPresencePeers, getSelfId } from '../../net/presence'
import { roomsFor } from '../../store'
import { showWishPins } from '../../ui/together/wishView'

function safeColour(colour: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(colour) ? colour : '#3FB8AF'
}

function wishOnLevel(level: Level, wish: Wish): { x: number; y: number } | null {
  const target = wish.target
  if (!target || wish.resolved) return null
  if (target.kind === 'point') {
    if (target.levelId !== level.id || !target.at) return null
    return target.at
  }
  if (target.kind === 'item') {
    const item = level.items.find((entry) => entry.id === target.id)
    return item ? item.position : null
  }
  const room = roomsFor(level).find((entry) => entry.key === target.key)
  return room ? room.centroid : null
}

registerPlanLayer({
  id: 'requirements',
  order: 65,
  draw(ctx2d, ctx) {
    const level = ctx.level
    if (!level) return
    let unmet: Set<string>
    try {
      unmet = unmetRoomKeys(ctx.project)
    } catch {
      return
    }
    if (unmet.size === 0) return
    for (const room of roomsFor(level)) {
      if (!unmet.has(room.key) || !room.centroid) continue
      const at = ctx.worldToScreen(room.centroid)
      ctx2d.save()
      ctx2d.fillStyle = '#d4655a'
      ctx2d.beginPath()
      ctx2d.arc(at.x, at.y - 16, 8, 0, Math.PI * 2)
      ctx2d.fill()
      ctx2d.fillStyle = '#fff'
      ctx2d.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'
      ctx2d.textAlign = 'center'
      ctx2d.textBaseline = 'middle'
      ctx2d.fillText('!', at.x, at.y - 16)
      ctx2d.restore()
    }
  },
})

registerPlanLayer({
  id: 'wishes',
  order: 72,
  draw(ctx2d, ctx) {
    if (!showWishPins() || !ctx.level) return
    const wishes = ctx.project.wishes ?? []
    for (const wish of wishes) {
      const at = wishOnLevel(ctx.level, wish)
      if (!at) continue
      const screen = ctx.worldToScreen(at)
      const glyph = REACTION_GLYPH[wish.reaction] ?? '•'
      ctx2d.save()
      ctx2d.fillStyle = wish.reaction === 'no' ? '#8a847a' : wish.reaction === 'idea' ? '#e8b86d' : '#d4655a'
      ctx2d.beginPath()
      ctx2d.arc(screen.x, screen.y, 9, 0, Math.PI * 2)
      ctx2d.fill()
      ctx2d.restore()
      paperLabel(ctx2d, screen.x, screen.y - 18, [
        { text: glyph, font: '14px ui-sans-serif, system-ui, sans-serif', color: '#2a241c' },
      ])
    }
  },
})

registerPlanLayer({
  id: 'presence',
  order: 120,
  draw(ctx2d, ctx) {
    const level = ctx.level
    const self = getSelfId()
    const peers = getPresencePeers().filter((peer) => peer.id && peer.id !== self)
    if (!level || peers.length === 0) return
    const away: string[] = []
    for (const peer of peers) {
      const colour = safeColour(peer.colour)
      if (peer.levelId !== level.id) {
        const name = ctx.project.levels?.find((item) => item.id === peer.levelId)?.name
        away.push(name ? `${peer.name} · ${name}` : peer.name)
        continue
      }
      for (const id of peer.selection ?? []) {
        const wall = level.walls.find((item) => item.id === id)
        if (wall) {
          try {
            strokePoly(ctx2d, ctx, wallPolygon(wall, level.walls), colour, 2)
          } catch {
            /* a broken wall outline is skipped */
          }
          continue
        }
        const item = level.items.find((entry) => entry.id === id)
        if (!item) continue
        strokePoly(ctx2d, ctx, itemCorners(item.position, item.size?.w ?? 1, item.size?.d ?? 1, item.rotation ?? 0), colour, 2)
      }
      if (peer.cursor) {
        const at = ctx.worldToScreen(peer.cursor)
        ctx2d.save()
        ctx2d.translate(at.x, at.y)
        ctx2d.fillStyle = colour
        ctx2d.beginPath()
        ctx2d.moveTo(0, 0)
        ctx2d.lineTo(-8, 16)
        ctx2d.lineTo(0, 11)
        ctx2d.lineTo(8, 16)
        ctx2d.closePath()
        ctx2d.fill()
        ctx2d.restore()
        paperLabel(ctx2d, at.x, at.y - 16, [
          { text: peer.name || 'Partner', font: '12px ui-sans-serif, system-ui, sans-serif', color: colour },
        ])
      }
      if (peer.camera) {
        const at = ctx.worldToScreen({ x: peer.camera.target.x, y: peer.camera.target.z })
        ctx2d.save()
        ctx2d.translate(at.x, at.y)
        ctx2d.strokeStyle = colour
        ctx2d.fillStyle = colour
        ctx2d.lineWidth = 1.5
        ctx2d.strokeRect(-7, -5, 14, 10)
        ctx2d.beginPath()
        ctx2d.moveTo(7, -3)
        ctx2d.lineTo(12, 0)
        ctx2d.lineTo(7, 3)
        ctx2d.stroke()
        ctx2d.restore()
      }
    }
    away.forEach((label, index) => {
      paperLabel(ctx2d, 80, 18 + index * 22, [
        { text: label, font: '12px ui-sans-serif, system-ui, sans-serif', color: '#2a241c' },
      ])
    })
  },
})
