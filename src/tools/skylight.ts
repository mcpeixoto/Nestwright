import { pointInPolygon } from '../model/geometry'
import { buildRoofModel, skylightRect } from '../model/roofs'
import { selectActiveLevel, useStore } from '../store'
import { translate } from '../i18n'
import { useSettings } from '../settings'
import { icon } from './icons'
import { registerTool } from './registry'

registerTool({
  id: 'skylight',
  label: 'Skylight',
  group: 'build',
  cursor: 'crosshair',
  icon: icon('<path d="M4 16 L12 8 L20 16"/><rect x="9" y="12" width="6" height="4"/>'),
  onPointerDown(ctx) {
    if (ctx.button !== 0) return
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    if (!level) return
    const roof = [...level.roofs].reverse().find((item) => {
      const footprint = buildRoofModel(item).footprint
      return footprint.length >= 3 && pointInPolygon(ctx.point, footprint)
    })
    if (!roof) {
      state.setMessage(translate(useSettings.getState().language, 'Click a roof to add a skylight'))
      return
    }
    const roofId = roof.id
    const rect = skylightRect(ctx.point, roof.ridgeAngle)
    const levelId = level.id
    state.apply('Add skylight', (project) => {
      const target = project.levels.find((item) => item.id === levelId)
      const found = target?.roofs.find((item) => item.id === roofId)
      if (found) found.cutouts.push(rect)
    })
    state.select([roofId])
  },
})
