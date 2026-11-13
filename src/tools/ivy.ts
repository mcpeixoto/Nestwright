import { cross, sub } from '../model/geometry'
import { paintIvy } from '../model/terrain'
import type { Vec2, Wall } from '../model/types'
import { findWallAt, locateOnWall, wallDirection } from '../model/walls'
import { selectActiveLevel, useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { allowDab } from './brushState'
import { icon } from './icons'
import { registerTool } from './registry'

let painting = false
let armed = false

function sideOf(wall: Wall, point: Vec2): 'left' | 'right' {
  const loc = locateOnWall(wall, point)
  const dir = wallDirection(wall)
  return cross(dir, sub(point, loc.point)) >= 0 ? 'left' : 'right'
}

export function ivyPointer(phase: 'down' | 'move' | 'up', point: Vec2, shift: boolean, wallId?: string | null): void {
  if (phase === 'up') {
    painting = false
    return
  }
  armed = true
  if (phase === 'down') painting = true
  if (!painting || !allowDab(28)) return
  const state = useStore.getState()
  const level = selectActiveLevel(state)
  if (!level) return
  const wall = (wallId ? level.walls.find((item) => item.id === wallId) : null) ?? findWallAt(level, point, 0.55)
  if (!wall) return
  const side = sideOf(wall, point)
  const id = wall.id
  const levelId = level.id
  state.apply('Paint ivy', (draft) => {
    const found = draft.levels.find((item) => item.id === levelId)?.walls.find((item) => item.id === id)
    if (!found) return
    paintIvy(found, side, shift ? -0.08 : 0.07)
  })
}

registerShortcut({
  id: 'tool-ivy',
  keys: 'i',
  description: 'Paint ivy',
  run: () => useStore.getState().setTool('ivy'),
})

registerTool({
  id: 'ivy',
  label: 'Ivy',
  shortcut: 'I',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<path d="M12 21V9"/><path d="M12 15c-2 0-4-2-5-4M12 12c2 0 4-2 5-4M12 9c-1-2-1-4 0-6"/>'),
  activate() {
    painting = false
    armed = false
  },
  deactivate() {
    painting = false
  },
  onPointerDown(ctx) {
    ivyPointer('down', ctx.raw, ctx.shift)
  },
  onPointerMove(ctx) {
    ivyPointer('move', ctx.raw, ctx.shift)
  },
  onPointerUp() {
    ivyPointer('up', { x: 0, y: 0 }, false)
  },
  drawOverlay(ctx2d, ctx) {
    if (!armed) return
    const level = selectActiveLevel(useStore.getState())
    const wall = level ? findWallAt(level, ctx.raw, 0.55) : null
    ctx2d.save()
    ctx2d.strokeStyle = '#2f6b45'
    ctx2d.lineWidth = 3
    if (wall) {
      const a = ctx.transform.worldToScreen(wall.a)
      const b = ctx.transform.worldToScreen(wall.b)
      ctx2d.beginPath()
      ctx2d.moveTo(a.x, a.y)
      ctx2d.lineTo(b.x, b.y)
      ctx2d.stroke()
    }
    ctx2d.restore()
  },
})
