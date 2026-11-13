import { deserialize, serialize } from '../io/project'
import { createLevel, createProject } from '../model/defaults'
import { deleteEntities, duplicateItems, rotateItems } from '../model/ops'
import { selectActiveLevel, useStore } from '../store'
import { getPlatform } from '../platform'

function fileName(name: string, ext: string): string {
  const clean = name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || 'project'
  return `${clean}.${ext}`
}

export async function saveProject(): Promise<void> {
  const project = useStore.getState().project
  const ok = await getPlatform().saveFile(fileName(project.name, 'nest'), serialize(project))
  useStore.getState().setMessage(ok ? 'Saved' : 'Save cancelled')
}

export async function exportJson(): Promise<void> {
  const project = useStore.getState().project
  const ok = await getPlatform().saveFile(fileName(project.name, 'json'), serialize(project))
  useStore.getState().setMessage(ok ? 'Exported JSON' : 'Export cancelled')
}

export async function openProject(): Promise<void> {
  const file = await getPlatform().openFile('.nest,.json,application/json')
  if (!file) return
  try {
    useStore.getState().setProject(deserialize(file.data))
    useStore.getState().setMessage(`Opened ${file.name}`)
  } catch (err) {
    useStore.getState().setMessage(err instanceof Error ? err.message : 'Could not open that file.')
  }
}

export function newProject(): void {
  if (typeof window !== 'undefined' && !window.confirm('Start a new empty project?')) return
  useStore.getState().setProject(createProject('Untitled', 'house'))
  useStore.getState().setMessage('New project')
}

export function deleteSelection(): void {
  const state = useStore.getState()
  if (state.selection.length === 0) return
  const levelId = state.activeLevelId
  const ids = state.selection
  state.apply('Delete', (draft) => {
    const level = draft.levels.find((l) => l.id === levelId)
    if (level) deleteEntities(level, ids)
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
    const base = draft.levels.find((l) => l.id === active.id)
    if (!base) return
    const elevation = base.elevation + base.height
    for (const level of draft.levels) {
      if (level.elevation >= elevation - 1e-6) level.elevation += base.height
    }
    const next = createLevel(`Level ${draft.levels.length + 1}`, elevation)
    created = next.id
    draft.levels.push(next)
    draft.levels.sort((a, b) => a.elevation - b.elevation)
  })
  if (created) useStore.getState().setActiveLevel(created)
}
