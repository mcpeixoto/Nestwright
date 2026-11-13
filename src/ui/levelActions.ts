import { duplicateLevel, insertLevel, removeLevel } from '../model/levels'
import { selectActiveLevel, useStore } from '../store'
import { confirmIfNeeded } from './confirm'
import { translate } from '../i18n'
import { useSettings } from '../settings'
import { fitVisible } from './fit'

export function addLevelBelow(): void {
  const state = useStore.getState()
  const active = selectActiveLevel(state)
  if (!active) return
  let created = ''
  state.apply('Add level below', (draft) => {
    created = insertLevel(draft.levels, active.id, 'below')?.id ?? ''
  })
  if (created) {
    const next = useStore.getState()
    next.setActiveLevel(created)
    next.setLevelDisplay('current-below')
    fitVisible()
  }
}

export function duplicateActiveLevel(): void {
  const state = useStore.getState()
  const active = selectActiveLevel(state)
  if (!active) return
  let created = ''
  state.apply('Duplicate level', (draft) => {
    created = duplicateLevel(draft.levels, active.id)?.id ?? ''
  })
  if (created) useStore.getState().setActiveLevel(created)
}

export function deleteActiveLevel(): void {
  const state = useStore.getState()
  if (state.project.levels.length <= 1) return
  const active = selectActiveLevel(state)
  if (!active) return
  const name = active.name || 'this level'
  const fallback = state.project.levels.find((level) => level.id !== active.id)
  const message = translate(useSettings.getState().language, 'Delete {name}? Walls on it are removed.').replace('{name}', name)
  confirmIfNeeded(message, () => {
    state.apply('Delete level', (draft) => {
      removeLevel(draft.levels, active.id)
    })
    if (fallback && useStore.getState().activeLevelId === active.id) {
      useStore.getState().setActiveLevel(fallback.id)
    }
  })
}
