import { fill, translate } from '../i18n'
import { currentFilePath, setFilePath } from '../io/documentPath'
import { markSaved } from '../io/dirty'
import { deserialize, serialize } from '../io/project'
import { createProject } from '../model/defaults'
import { insertLevel } from '../model/levels'
import { copyItems, groupCentre, pasteItems, rotateItemGroup, type ItemClip } from '../model/itemClipboard'
import { deleteEntities, duplicateItems, rotateItems } from '../model/ops'
import { getPlanRenderer } from '../plan2d/PlanRenderer'
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

/** Select every item on the active level. */
export function selectAllItems(): void {
  const state = useStore.getState()
  const level = selectActiveLevel(state)
  if (!level) return
  state.select(level.items.map((item) => item.id))
}

/** Turn the selected items 90° about their common centre, as one undo step. */
export function rotateSelectionQuarter(): void {
  const state = useStore.getState()
  const level = selectActiveLevel(state)
  if (!level) return
  const ids = state.selection.filter((id) => level.items.some((item) => item.id === id))
  if (ids.length === 0) return
  const levelId = level.id
  state.apply('Rotate', (draft) => {
    const target = draft.levels.find((l) => l.id === levelId)
    if (target) rotateItemGroup(target, ids, Math.PI / 2)
  })
}

let clipboard: ItemClip | null = null
/** Centre of the last copied group, so a paste without a cursor on the plan lands next to it. */
let copiedCentre = { x: 0, y: 0 }

export function hasItemClipboard(): boolean {
  return clipboard !== null
}

function sayCount(key: string, count: number): void {
  useStore.getState().setMessage(fill(useSettings.getState().language, key, { count }))
}

/** Copy the selected items to the in-memory clipboard (and the system clipboard as JSON when allowed). */
export function copySelection(): boolean {
  const state = useStore.getState()
  const level = selectActiveLevel(state)
  if (!level) return false
  const clip = copyItems(level, state.selection)
  if (!clip) return false
  clipboard = clip
  copiedCentre = groupCentre(level.items.filter((item) => state.selection.includes(item.id)))
  try {
    void navigator.clipboard?.writeText(JSON.stringify(clip)).catch(() => {})
  } catch {
    /* the in-memory copy is enough */
  }
  sayCount('{count} items copied', clip.items.length)
  return true
}

/** The cursor, when it is over the plan. */
function planCursor(): { x: number; y: number } | null {
  const renderer = getPlanRenderer()
  if (!renderer || !renderer.canvas.isConnected) return null
  const { x, y } = renderer.pointer.screen
  const inside = x > 0 && y > 0 && x < renderer.canvas.clientWidth && y < renderer.canvas.clientHeight
  return inside ? { ...renderer.pointer.raw } : null
}

/** Paste the clipboard onto the active level as one undo step, and select the copies. */
export function pasteClipboard(at?: { x: number; y: number }): boolean {
  const clip = clipboard
  const state = useStore.getState()
  const level = selectActiveLevel(state)
  if (!clip || !level) return false
  const target = at ?? planCursor() ?? { x: copiedCentre.x + 0.2, y: copiedCentre.y + 0.2 }
  const levelId = level.id
  let created: string[] = []
  state.apply('Paste', (draft) => {
    const found = draft.levels.find((l) => l.id === levelId)
    if (found) created = pasteItems(found, clip, target)
  })
  if (created.length === 0) return false
  copiedCentre = target
  useStore.getState().select(created)
  sayCount('{count} items pasted', created.length)
  return true
}
