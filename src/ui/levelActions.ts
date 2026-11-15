import { duplicateLevel, insertLevel, removeLevel } from '../model/levels'
import { fitTraceToView } from '../model/trace'
import { prepareTraceImage } from '../io/traceImport'
import { getPlanRenderer } from '../plan2d/PlanRenderer'
import { getPlatform } from '../platform'
import { selectActiveLevel, useStore } from '../store'
import { startTraceCalibration } from '../tools/traceCalibrate'
import { confirmIfNeeded } from './confirm'
import { translate } from '../i18n'
import { useSettings } from '../settings'
import { fitVisible } from './fit'

const TRACE_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf'

function planView() {
  const renderer = getPlanRenderer()
  const width = renderer?.canvas.clientWidth ?? 0
  const height = renderer?.canvas.clientHeight ?? 0
  if (!renderer || width < 2 || height < 2) return { minX: 0, minY: 0, maxX: 10, maxY: 8 }
  const topLeft = renderer.screenToWorld(0, 0)
  const bottomRight = renderer.screenToWorld(width, height)
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  }
}

let importing = false

export async function importTraceImage(): Promise<void> {
  if (importing) return
  const file = await getPlatform().openFile(TRACE_ACCEPT)
  if (!file) return
  const levelId = useStore.getState().activeLevelId
  if (!levelId) return
  importing = true
  try {
    const image = await prepareTraceImage(file.name, file.data)
    const trace = fitTraceToView({
      levelId,
      src: image.src,
      width: image.width,
      height: image.height,
      view: planView(),
    })
    useStore.getState().apply('Import trace', (draft) => {
      draft.traces = [...draft.traces.filter((item) => item.levelId !== levelId), trace]
    })
    startTraceCalibration()
  } catch {
    useStore.getState().setMessage(translate(useSettings.getState().language, 'Could not read that image.'))
  } finally {
    importing = false
  }
}

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
