import { translate } from '../i18n'
import { currentFilePath, setFilePath } from '../io/documentPath'
import { markSaved } from '../io/dirty'
import { deserialize, serialize } from '../io/project'
import { createProject } from '../model/defaults'
import { insertLevel } from '../model/levels'
import { deleteEntities, duplicateItems, rotateItems } from '../model/ops'
import type { Project } from '../model/types'
import { selectActiveLevel, useStore } from '../store'
import { confirmIfNeeded } from './confirm'
import { fitVisible } from './fit'
import { presentProject } from './presentProject'
import { getPlatform } from '../platform'
import { useSettings } from '../settings'
import { requestEnterEditor } from './enterEditor'
import { rememberProject } from './start/recent'
import { scheduleThumb } from './start/thumbs'

function say(key: string): void {
  useStore.getState().setMessage(translate(useSettings.getState().language, key))
}

function fileName(name: string, ext: string): string {
  const clean = name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || 'project'
  return `${clean}.${ext}`
}

function finishSave(saved: Project): void {
  if (useStore.getState().project === saved) markSaved()
  scheduleThumb((thumb) => rememberProject(saved, thumb))
  say('Saved')
}

async function writeProject(forceDialog: boolean): Promise<boolean> {
  const project = useStore.getState().project
  let data: string
  try {
    data = serialize(project)
  } catch {
    say('Could not save the project.')
    return false
  }
  const platform = getPlatform()
  const remembered = currentFilePath()
  const name = fileName(project.name, 'nest')
  if (!forceDialog && remembered && platform.saveToPath) {
    const ok = await platform.saveToPath(remembered, data)
    if (!ok) {
      say('Could not save the project.')
      return false
    }
    finishSave(project)
    return true
  }
  if (platform.chooseSavePath) {
    const chosen = await platform.chooseSavePath(name, data)
    if (!chosen) {
      say('Save cancelled')
      return false
    }
    setFilePath(chosen)
    finishSave(project)
    return true
  }
  const ok = await platform.saveFile(name, data)
  if (!ok) {
    say('Save cancelled')
    return false
  }
  finishSave(project)
  return true
}

export async function saveProject(): Promise<boolean> {
  return writeProject(false)
}

export async function saveProjectAs(): Promise<boolean> {
  return writeProject(true)
}

export async function exportJson(): Promise<void> {
  const project = useStore.getState().project
  const ok = await getPlatform().saveFile(fileName(project.name, 'json'), serialize(project))
  say(ok ? 'Exported JSON' : 'Export cancelled')
}

export function openReceivedFile(file: { name: string; data: string; path?: string | null }): boolean {
  try {
    const project = deserialize(file.data)
    presentProject(project)
    setFilePath(file.path && /\.nest$/i.test(file.path) ? file.path : null)
    markSaved()
    scheduleThumb((thumb) => rememberProject(project, thumb))
    useStore.getState().setMessage(`${translate(useSettings.getState().language, 'Open')} ${file.name}`)
    return true
  } catch (err) {
    useStore.getState().setMessage(err instanceof Error ? err.message : translate(useSettings.getState().language, 'Could not open that file.'))
    return false
  }
}

export async function openProject(): Promise<boolean> {
  const file = await getPlatform().openFile('.nest,.json,application/json')
  if (!file) return false
  return openReceivedFile(file)
}

export function newProject(): void {
  const language = useSettings.getState().language
  confirmIfNeeded(translate(language, 'Start a new empty project?'), () => {
    const project = createProject('Untitled', 'house')
    project.units = useSettings.getState().units
    setFilePath(null)
    presentProject(project)
    markSaved()
    requestEnterEditor()
    say('New project')
  })
}

export function deleteSelection(): void {
  const state = useStore.getState()
  if (state.selection.length === 0) return
  const levelId = state.activeLevelId
  const ids = state.selection
  state.apply('Delete', (draft) => {
    const level = draft.levels.find((l) => l.id === levelId)
    if (level) deleteEntities(level, ids)
    const drop = new Set(ids)
    const terrain = draft.terrain
    if (!terrain) return
    if (terrain.plants.some((plant) => drop.has(plant.id))) {
      terrain.plants = terrain.plants.filter((plant) => !drop.has(plant.id))
    }
    if (terrain.water.some((body) => drop.has(body.id))) {
      terrain.water = terrain.water.filter((body) => !drop.has(body.id))
    }
    if (terrain.fences.some((fence) => drop.has(fence.id))) {
      terrain.fences = terrain.fences.filter((fence) => !drop.has(fence.id))
    }
  })
  useStore.getState().select([])
}

export function duplicateSelection(): void {
  const state = useStore.getState()
  const levelId = state.activeLevelId
  let created: string[] = []
  state.apply('Duplicate', (draft) => {
    const level = draft.levels.find((l) => l.id === levelId)
    if (level) created = duplicateItems(level, state.selection)
  })
  if (created.length > 0) useStore.getState().select(created)
}

export function rotateSelection(): boolean {
  const state = useStore.getState()
  const level = selectActiveLevel(state)
  if (!level) return false
  const ids = state.selection.filter((id) => level.items.some((item) => item.id === id))
  if (ids.length === 0) return false
  const levelId = level.id
  state.apply('Rotate', (draft) => {
    const target = draft.levels.find((l) => l.id === levelId)
    if (target) rotateItems(target, ids, Math.PI / 12)
  })
  return true
}

export function addLevelAbove(): void {
  const state = useStore.getState()
  const active = selectActiveLevel(state)
  if (!active) return
  let created = ''
  state.apply('Add level', (draft) => {
    const next = insertLevel(draft.levels, active.id, 'above')
    created = next?.id ?? ''
  })
  if (created) {
    const next = useStore.getState()
    next.setActiveLevel(created)
    next.setLevelDisplay('current-below')
    fitVisible()
  }
}
