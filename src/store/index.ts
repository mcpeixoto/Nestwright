import { enablePatches, produceWithPatches, applyPatches, type Patch } from 'immer'
import { create } from 'zustand'
import '../catalog'
import { loadAutosave } from '../io/autosave'
import { getTool } from '../tools/registry'
import { levelToOpen } from '../model/openLevel'
import { detectRooms, ensureRoomRecords } from '../model/rooms'
import type { Level, OpeningType, Project, Room } from '../model/types'
import { createSampleProject } from '../sample'

enablePatches()

export interface HistoryEntry {
  label: string
  patches: Patch[]
  inversePatches: Patch[]
  time: number
}

export type ViewMode = '2d' | '3d' | 'split' | 'walk'
export type LevelDisplay = 'all' | 'current' | 'current-below'

const COALESCE_MS = 400
const HISTORY_CAP = 80

export const UNDO_BLOCKED = "Partner changed this — can't undo"
export const REDO_BLOCKED = "Partner changed this — can't redo"

type PatchListener = (patches: Patch[]) => void
type EditListener = (patches: Patch[], inverse: Patch[]) => void
const patchListeners = new Set<PatchListener>()
const editListeners = new Set<EditListener>()
const localApplyListeners = new Set<() => void>()
const beforeLocalApplyListeners = new Set<() => void>()

export function subscribeLocalApplies(listener: () => void): () => void {
  localApplyListeners.add(listener)
  return () => localApplyListeners.delete(listener)
}

/** Fires after a recipe produces patches, before the store swaps the project. */
export function subscribeBeforeLocalApply(listener: () => void): () => void {
  beforeLocalApplyListeners.add(listener)
  return () => beforeLocalApplyListeners.delete(listener)
}

function emitEdit(patches: Patch[], inverse: Patch[]): void {
  if (patches.length === 0) return
  for (const listener of patchListeners) {
    try {
      listener(patches)
    } catch {
      /* a co-op listener must not break the edit */
    }
  }
  for (const listener of editListeners) {
    try {
      listener(patches, inverse)
    } catch {
      /* a co-op listener must not break the edit */
    }
  }
}

function bootProject(): Project {
  const saved = loadAutosave()
  if (saved) return saved
  return createSampleProject()
}

const initial = bootProject()

export interface StoreState {
  project: Project
  activeLevelId: string
  selection: string[]
  tool: string
  view: ViewMode
  levelDisplay: LevelDisplay
  /** 2D roof overlay and 3D roof meshes. Not part of the save file. */
  showRoofs: boolean
  hover: string | null
  past: HistoryEntry[]
  future: HistoryEntry[]
  canUndo: boolean
  canRedo: boolean
  openingSubtype: OpeningType
  snapGrid: boolean
  snapEnds: boolean
  snapAngles: boolean
  libraryOpen: boolean
  message: string
  /** Label of the pointer stroke currently grouping undo steps, if any. */
  stroke: string | null
  apply: (label: string, recipe: (draft: Project) => void) => void
  beginStroke: (label: string) => void
  endStroke: () => void
  undo: () => void
  redo: () => void
  setProject: (project: Project) => void
  select: (ids: string[], additive?: boolean) => void
  setTool: (tool: string) => void
  setView: (view: ViewMode) => void
  setLevelDisplay: (mode: LevelDisplay) => void
  setShowRoofs: (show: boolean) => void
  setHover: (id: string | null) => void
  setActiveLevel: (id: string) => void
  setOpeningSubtype: (type: OpeningType) => void
  setSnap: (partial: Partial<Pick<StoreState, 'snapGrid' | 'snapEnds' | 'snapAngles'>>) => void
  setLibraryOpen: (open: boolean) => void
  setMessage: (message: string) => void
  subscribePatches: (listener: PatchListener) => () => void
  /** Apply, undo, and redo. Inverse patches let a co-op client rebase in-flight edits. */
  subscribeEdits: (listener: EditListener) => () => void
  applyRemotePatches: (patches: Patch[]) => void
}

function unique(ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) if (!out.includes(id)) out.push(id)
  return out
}

export const useStore = create<StoreState>((set, get) => ({
  project: initial,
  activeLevelId: levelToOpen(initial) || initial.levels[0]?.id || '',
  selection: [],
  tool: 'select',
  view: 'split',
  levelDisplay: 'all',
  showRoofs: true,
  hover: null,
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,
  openingSubtype: 'door',
  snapGrid: true,
  snapEnds: true,
  snapAngles: true,
  libraryOpen: false,
  message: '',
  stroke: null,

  beginStroke(label) {
    set({ stroke: label })
  },

  endStroke() {
    if (get().stroke == null) return
    set({ stroke: null })
  },

  apply(label, recipe) {
    const now = Date.now()
    const current = get().project
    const [next, patches, inversePatches] = produceWithPatches(current, (draft) => {
      recipe(draft as unknown as Project)
      for (const level of draft.levels) ensureRoomRecords(level)
      draft.updatedAt = now
    })
    if (patches.length === 0) return
    for (const listener of beforeLocalApplyListeners) {
      try {
        listener()
      } catch {
        /* a listener must not block the edit */
      }
    }
    const { past, stroke } = get()
    const last = past[past.length - 1]
    let history: HistoryEntry[]
    const sameStroke = stroke === label && last?.label === label
    if (last && (sameStroke || (stroke == null && last.label === label && now - last.time <= COALESCE_MS))) {
      history = [
        ...past.slice(0, -1),
        {
          label,
          time: now,
          patches: [...last.patches, ...patches],
          inversePatches: [...inversePatches, ...last.inversePatches],
        },
      ]
    } else {
      history = [...past, { label, patches, inversePatches, time: now }]
      if (history.length > HISTORY_CAP) history = history.slice(history.length - HISTORY_CAP)
    }
    set({ project: next as Project, past: history, future: [], canUndo: true, canRedo: false })
    emitEdit(patches, inversePatches)
    for (const listener of localApplyListeners) {
      try {
        listener()
      } catch {
        /* an achievement listener must not break the edit */
      }
    }
  },

  undo() {
    const { past, future, project } = get()
    const entry = past[past.length - 1]
    if (!entry) return
    let restored: Project
    try {
      restored = applyPatches(project, entry.inversePatches) as Project
    } catch {
      const nextPast = past.slice(0, -1)
      set({
        past: nextPast,
        canUndo: nextPast.length > 0,
        message: UNDO_BLOCKED,
      })
      return
    }
    const nextPast = past.slice(0, -1)
    set({
      project: restored,
      past: nextPast,
      future: [entry, ...future],
      canUndo: nextPast.length > 0,
      canRedo: true,
    })
    emitEdit(entry.inversePatches, entry.patches)
  },

  redo() {
    const { past, future, project } = get()
    const entry = future[0]
    if (!entry) return
    let restored: Project
    try {
      restored = applyPatches(project, entry.patches) as Project
    } catch {
      const nextFuture = future.slice(1)
      set({
        future: nextFuture,
        canRedo: nextFuture.length > 0,
        message: REDO_BLOCKED,
      })
      return
    }
    const nextFuture = future.slice(1)
    set({
      project: restored,
      past: [...past, entry],
      future: nextFuture,
      canUndo: true,
      canRedo: nextFuture.length > 0,
    })
    emitEdit(entry.patches, entry.inversePatches)
  },

  setProject(project) {
    const active = project.levels.some((level) => level.id === get().activeLevelId)
      ? get().activeLevelId
      : (project.levels[0]?.id ?? '')
    set({
      project,
      activeLevelId: active,
      selection: [],
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
      message: '',
      stroke: null,
    })
  },

  select(ids, additive = false) {
    set((state) => {
      if (!additive) return { selection: unique(ids) }
      const next = new Set(state.selection)
      for (const id of ids) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      return { selection: [...next] }
    })
  },

  setTool(tool) {
    const prev = get().tool
    if (prev === tool) return
    getTool(prev)?.deactivate?.()
    set({ tool })
    getTool(tool)?.activate?.()
  },

  setView(view) {
    set({ view })
  },

  setLevelDisplay(levelDisplay) {
    set({ levelDisplay })
  },

  setShowRoofs(showRoofs) {
    set({ showRoofs })
  },

  setHover(hover) {
    if (get().hover === hover) return
    set({ hover })
  },

  setActiveLevel(activeLevelId) {
    set({ activeLevelId, selection: [] })
  },

  setOpeningSubtype(openingSubtype) {
    set({ openingSubtype })
  },

  setSnap(partial) {
    set(partial)
  },

  setLibraryOpen(libraryOpen) {
    set({ libraryOpen })
  },

  setMessage(message) {
    set({ message })
  },

  subscribePatches(listener) {
    patchListeners.add(listener)
    return () => patchListeners.delete(listener)
  },

  subscribeEdits(listener) {
    editListeners.add(listener)
    return () => editListeners.delete(listener)
  },

  applyRemotePatches(patches) {
    if (patches.length === 0) return
    set({ project: applyPatches(get().project, patches) as Project })
  },
}))

export function selectActiveLevel(state: StoreState): Level | undefined {
  return state.project.levels.find((level) => level.id === state.activeLevelId)
}

const NO_ROOMS: Room[] = []
const roomCache = new WeakMap<Level, Room[]>()

/** Memoised on the level object's identity, which immer preserves across unrelated edits. */
export function selectRooms(levelId: string): (state: StoreState) => Room[] {
  return (state) => {
    const level = state.project.levels.find((item) => item.id === levelId)
    if (!level) return NO_ROOMS
    const cached = roomCache.get(level)
    if (cached) return cached
    const rooms = detectRooms(level)
    roomCache.set(level, rooms)
    return rooms
  }
}

export function roomsFor(level: Level): Room[] {
  const cached = roomCache.get(level)
  if (cached) return cached
  const rooms = detectRooms(level)
  roomCache.set(level, rooms)
  return rooms
}
