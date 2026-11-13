import { useSyncExternalStore } from 'react'
import { loadAutosave } from '../io/autosave'
import { useSettings } from '../settings'
import { useStore, type ViewMode } from '../store'
import { studioApartment } from '../templates'
import type { Project } from '../model/types'

export type Screen = 'start' | 'gallery' | 'editor'

function hasAutosave(): boolean {
  try {
    return loadAutosave() != null
  } catch {
    return false
  }
}

let screen: Screen = 'start'
let canContinue = false
let returnView: ViewMode = 'split'
const listeners = new Set<() => void>()

function publish(): void {
  for (const listener of listeners) listener()
}

function boot(): void {
  canContinue = hasAutosave()
  if (canContinue && useSettings.getState().continueLast) {
    screen = 'editor'
    return
  }
  screen = 'start'
  returnView = useStore.getState().view
  if (!canContinue) {
    try {
      const preview = studioApartment()
      preview.units = useSettings.getState().units
      useStore.getState().setProject(preview)
    } catch {
      /* the project already in the store stays behind the glass */
    }
  }
  useStore.getState().setView('3d')
}

boot()

export function useScreen(): Screen {
  return useSyncExternalStore(subscribeScreen, () => screen, () => 'editor')
}

export function canContinueProject(): boolean {
  return canContinue
}

function subscribeScreen(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showGallery(): void {
  screen = 'gallery'
  publish()
}

export function showStart(): void {
  screen = 'start'
  publish()
}

export function openHome(): void {
  canContinue = true
  const view = useStore.getState().view
  returnView = view
  if (view !== '3d') useStore.getState().setView('3d')
  screen = 'start'
  publish()
}

export function enterEditor(): void {
  screen = 'editor'
  if (returnView) useStore.getState().setView(returnView)
  publish()
}

export function beginProject(project: Project): void {
  const units = useSettings.getState().units
  project.units = units
  useStore.getState().setProject(project)
  returnView = 'split'
  useStore.getState().setView('split')
  canContinue = true
  screen = 'editor'
  publish()
}
