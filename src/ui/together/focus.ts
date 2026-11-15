import { translate } from '../../i18n'
import { useSettings } from '../../settings'
import { getPlanRenderer } from '../../plan2d/PlanRenderer'
import { roomsFor, useStore } from '../../store'
import { getController } from '../../view3d/SceneController'
import type { Wish } from '../../model/types'

export function focusWish(wish: Wish): void {
  const state = useStore.getState()
  const target = wish.target
  if (!target) {
    state.setMessage(translate(useSettings.getState().language, 'That pin has nowhere to land.'))
    return
  }
  if (target.kind === 'item') {
    for (const level of state.project.levels ?? []) {
      const item = level.items.find((entry) => entry.id === target.id)
      if (!item) continue
      state.setActiveLevel(level.id)
      state.select([item.id])
      getPlanRenderer()?.centerOn(item.position)
      getController()?.frameAt({ x: item.position.x, y: level.elevation + item.elevation, z: item.position.y })
      return
    }
  } else if (target.kind === 'room') {
    for (const level of state.project.levels ?? []) {
      const room = roomsFor(level).find((entry) => entry.key === target.key)
      if (!room) continue
      state.setActiveLevel(level.id)
      state.select(target.key.split(',').filter(Boolean))
      getPlanRenderer()?.centerOn(room.centroid)
      getController()?.frameAt({ x: room.centroid.x, y: level.elevation + 1.2, z: room.centroid.y })
      return
    }
  } else if (target.at) {
    const level = state.project.levels?.find((entry) => entry.id === target.levelId)
    if (level) state.setActiveLevel(level.id)
    getPlanRenderer()?.centerOn(target.at)
    getController()?.frameAt({ x: target.at.x, y: (level?.elevation ?? 0) + 1.2, z: target.at.y })
    return
  }
  state.setMessage(translate(useSettings.getState().language, 'That pin is not on the plan anymore.'))
}
