import { addWallChain } from '../model/ops'
import { mat } from '../model/defaults'
import { newId } from '../model/ids'
import { selectActiveLevel, useStore } from '../store'
import { translate } from '../i18n'
import { useSettings } from '../settings'
import { icon } from './icons'
import { registerTool } from './registry'

function say(key: string): void {
  useStore.getState().setMessage(translate(useSettings.getState().language, key))
}

registerTool({
  id: 'balcony',
  label: 'Balcony',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<path d="M4 14h16M6 14v4M18 14v4M4 18h16"/>'),
  onPointerDown(ctx) {
    if (ctx.button !== 0) return
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    if (!level || level.walls.filter((wall) => wall.kind !== 'railing').length === 0) {
      say('Draw the apartment walls first')
      return
    }
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    for (const wall of level.walls) {
      if (wall.kind === 'railing') continue
      for (const point of [wall.a, wall.b]) {
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
      }
    }
    if (!Number.isFinite(minX) || maxX - minX < 1.2) {
      say('Draw the apartment walls first')
      return
    }
    const inset = Math.min(0.8, (maxX - minX) * 0.15)
    const depth = 1.4
    const polygon = [
      { x: minX + inset, y: minY },
      { x: maxX - inset, y: minY },
      { x: maxX - inset, y: minY - depth },
      { x: minX + inset, y: minY - depth },
    ]
    const levelId = level.id
    state.apply('Add balcony', (draft) => {
      const target = draft.levels.find((item) => item.id === levelId)
      if (!target) return
      target.slabs.push({
        id: newId('slab'),
        polygon,
        thickness: 0.16,
        top: 0.02,
        material: mat('concrete'),
      })
      addWallChain(
        target,
        [
          { x: polygon[0]!.x + 0.04, y: polygon[3]!.y },
          { x: polygon[1]!.x - 0.04, y: polygon[2]!.y },
          { x: polygon[1]!.x - 0.04, y: minY - 0.12 },
        ],
        { kind: 'railing', height: 1.05, thickness: 0.06, left: mat('metal-black'), right: mat('metal-black') },
      )
      addWallChain(
        target,
        [
          { x: polygon[0]!.x + 0.04, y: polygon[3]!.y },
          { x: polygon[0]!.x + 0.04, y: minY - 0.12 },
        ],
        { kind: 'railing', height: 1.05, thickness: 0.06, left: mat('metal-black'), right: mat('metal-black') },
      )
    })
  },
})
