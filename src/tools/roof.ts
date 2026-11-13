import { pointInPolygon } from '../model/geometry'
import { newId } from '../model/ids'
import { outerOutline, roofOnOutline } from '../model/roofs'
import { selectActiveLevel, useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'

registerTool({
  id: 'roof',
  label: 'Roof',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<path d="M3 14 L12 6 L21 14"/><path d="M6 14v5h12v-5"/>'),
  onPointerDown(ctx) {
    if (ctx.button !== 0) return
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    if (!level) return
    const outline = outerOutline(level)
    if (outline.length < 3 || !pointInPolygon(ctx.point, outline)) {
      state.setMessage('Click inside the walls to roof this level')
      return
    }
    const existing = roofOnOutline(level, outline)
    if (existing) {
      state.select([existing.id])
      return
    }
    const id = level.id
    let created = ''
    state.apply('Add roof', (project) => {
      const target = project.levels.find((item) => item.id === id)
      if (!target) return
      const ring = outerOutline(target)
      if (ring.length < 3) return
      created = newId('roof')
      target.roofs.push({
        id: created,
        shape: 'gable',
        outline: ring.map((p) => ({ x: p.x, y: p.y })),
        pitch: Math.PI / 6,
        overhang: 0.3,
        ridgeAngle: 0,
        thickness: 0.08,
        material: { id: 'roof-tiles' },
        cutouts: [],
      })
    })
    if (created) useStore.getState().select([created])
  },
})
