import type { UnitSystem } from '../model/units'
import { useStore } from '../store'
import { useSettings } from './index'

/** One writer for the preference and the open project, so the two cannot drift. */
export function setUnits(units: UnitSystem): void {
  useSettings.getState().setSettings({ units })
  if (useStore.getState().project.units === units) return
  useStore.getState().apply('Units', (draft) => {
    draft.units = units
  })
}
