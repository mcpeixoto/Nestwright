import { newId } from '../model/ids'
import { selectActiveLevel, useStore } from '../store'
import { icon } from './icons'
import { registerTool } from './registry'

registerTool({
  id: 'column',
  label: 'Column',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<rect x="9" y="4" width="6" height="16" rx="1"/>'),
  onPointerDown(ctx) {
    if (ctx.button !== 0) return
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    if (!level) return
    const levelId = level.id
    let created = ''
    state.apply('Add column', (project) => {
      const target = project.levels.find((item) => item.id === levelId)
      if (!target) return
      created = newId('column')
      target.columns.push({
        id: created,
        position: { x: ctx.point.x, y: ctx.point.y },
        size: 0.3,
        round: false,
        material: { id: 'concrete' },
      })
    })
    if (created) useStore.getState().select([created])
  },
})
