import { clockAltitude } from '../model/sun'
import { sunLook } from '../model/sunLook'
import { useStore } from '../store'
import { roomAt } from '../view3d/lighting/focus'
import { getController } from '../view3d/SceneController'
import type { AmbienceInput } from './ambience'

/**
 * Daylight is the same 0–1 the sky uses (`clockAltitude` → `sunLook`). Indoor is the
 * primary camera standing in a detected room (`pose` + `roomAt`). SceneController does
 * not emit either, so the ambience loop polls this.
 */
export function sceneAmbienceInput(): AmbienceInput {
  const state = useStore.getState()
  const env = state.project.environment
  const day = Number.isFinite(env.dayOfYear) ? env.dayOfYear : 172
  const hour = Number.isFinite(env.time) ? env.time : 12
  const latitude = Number.isFinite(env.latitude) ? env.latitude : 41.15
  const daylight = sunLook(clockAltitude(day, hour, latitude)).daylight
  let indoor = false
  if (state.view !== '2d') {
    const pos = getController()?.pose()?.pos
    if (pos) {
      indoor = roomAt(state.project, { activeLevelId: state.activeLevelId, levelDisplay: state.levelDisplay }, pos) != null
    }
  }
  return {
    daylight,
    indoor,
    view: state.view,
    rain: env.weather === 'rain',
  }
}
