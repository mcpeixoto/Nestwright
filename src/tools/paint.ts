import { getEntry } from '../catalog/registry'
import type { MaterialRef } from '../model/types'
import { paintLevel, readMaterial, roofAt, wallFace, type PaintTarget } from '../model/paint'
import { roomAt } from '../model/rooms'
import { findWallAt } from '../model/walls'
import { pointInItem } from '../plan2d/snap'
import { selectActiveLevel, useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { icon } from './icons'
import { registerTool } from './registry'

let brush: MaterialRef = { id: 'paint-sage', scale: 1 }
const listeners = new Set<() => void>()

export function paintBrush(): MaterialRef {
  return brush
}

export function setPaintBrush(next: MaterialRef): void {
  brush = { id: next.id, ...(next.tint ? { tint: next.tint } : {}), ...(next.scale ? { scale: next.scale } : {}) }
  for (const listener of listeners) listener()
}

export function subscribePaintBrush(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function eyedropMaterial(material: MaterialRef): void {
  setPaintBrush(material)
  useStore.getState().setTool('paint')
}

export function planPaintTarget(point: { x: number; y: number }, ceiling: boolean): PaintTarget | null {
  const level = selectActiveLevel(useStore.getState())
  if (!level) return null
  const wall = findWallAt(level, point, 0.16)
  if (wall) return { kind: 'wall', id: wall.id, side: wallFace(wall, point) }
  for (let i = level.items.length - 1; i >= 0; i--) {
    const item = level.items[i]
    if (!item) continue
    if (!pointInItem(point, item.position, item.size.w, item.size.d, item.rotation)) continue
    const entry = getEntry(item.catalogId)
    const slot = Object.keys(item.materials)[0] ?? Object.keys(entry?.materialSlots ?? {})[0] ?? 'body'
    return { kind: 'item', id: item.id, slot }
  }
  const room = roomAt(level, point)
  if (room) return { kind: ceiling ? 'ceiling' : 'floor', key: room.key }
  const roof = roofAt(level, point)
  if (roof) return { kind: 'roof', id: roof }
  return null
}

function paintAt(point: { x: number; y: number }, ceiling: boolean): void {
  const target = planPaintTarget(point, ceiling)
  const levelId = useStore.getState().activeLevelId
  if (!target) return
  const material = paintBrush()
  useStore.getState().apply('Paint', (draft) => {
    const level = draft.levels.find((entry) => entry.id === levelId)
    if (level) paintLevel(level, target, material)
  })
}

export function eyedropPlan(point: { x: number; y: number }, ceiling: boolean): void {
  const level = selectActiveLevel(useStore.getState())
  const target = planPaintTarget(point, ceiling)
  if (!level || !target) return
  const material = readMaterial(level, target)
  if (material) eyedropMaterial(material)
}

registerShortcut({
  id: 'tool-paint',
  keys: 'p',
  description: 'Paint tool',
  run: () => useStore.getState().setTool('paint'),
})

registerTool({
  id: 'paint',
  label: 'Paint',
  shortcut: 'P',
  group: 'interior',
  cursor: 'crosshair',
  icon: icon('<path d="M14 4l6 6-8.5 8.5a2 2 0 0 1-2.8 0L4.5 14.3a2 2 0 0 1 0-2.8z"/><path d="M4 20h4"/>'),
  onPointerDown(ctx) {
    if (ctx.alt) {
      eyedropPlan(ctx.raw, ctx.shift)
      return
    }
    paintAt(ctx.raw, ctx.shift)
  },
})
