import { selectActiveLevel, useStore, type ViewMode } from '../store'
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  hasItemClipboard,
  pasteClipboard,
  rotateSelection,
  saveProject,
  saveProjectAs,
  selectAllItems,
} from './actions'
import { fitVisible } from './fit'
import { registerShortcut, setHelpOpen } from './shortcuts'

/** The Electron File menu registers these accelerators. Handling them here as well would save twice. */
function appMenuOwnsShortcut(): boolean {
  return typeof window !== 'undefined' && !!window.nestwright
}

const VIEWS: ViewMode[] = ['2d', '3d', 'split']

registerShortcut({
  id: 'undo',
  keys: 'mod+z',
  description: 'Undo',
  run: () => useStore.getState().undo(),
})

registerShortcut({
  id: 'redo',
  keys: 'mod+shift+z',
  description: 'Redo',
  run: () => useStore.getState().redo(),
})

registerShortcut({
  id: 'save',
  keys: 'mod+s',
  description: 'Save',
  when: () => !appMenuOwnsShortcut(),
  run: () => void saveProject(),
})

registerShortcut({
  id: 'save-as',
  keys: 'mod+shift+s',
  description: 'Save As…',
  when: () => !appMenuOwnsShortcut(),
  run: () => void saveProjectAs(),
})

registerShortcut({
  id: 'duplicate',
  keys: 'mod+d',
  description: 'Duplicate selection',
  run: () => duplicateSelection(),
})

function selectionHasItems(): boolean {
  const state = useStore.getState()
  const level = selectActiveLevel(state)
  return level?.items.some((item) => state.selection.includes(item.id)) ?? false
}

/** Copying page text still works when no item is selected. */
function noTextSelected(): boolean {
  if (typeof window === 'undefined') return true
  const text = window.getSelection?.()?.toString() ?? ''
  return text.length === 0
}

registerShortcut({
  id: 'copy-items',
  keys: 'mod+c',
  description: 'Copy selected items',
  when: () => selectionHasItems() && noTextSelected(),
  run: () => void copySelection(),
})

registerShortcut({
  id: 'paste-items',
  keys: 'mod+v',
  description: 'Paste items',
  when: () => hasItemClipboard(),
  run: () => void pasteClipboard(),
})

registerShortcut({
  id: 'select-all-items',
  keys: 'mod+a',
  description: 'Select all items',
  run: () => {
    selectAllItems()
    window.getSelection?.()?.removeAllRanges()
  },
})

registerShortcut({
  id: 'view',
  keys: 'tab',
  description: 'Cycle 2D, 3D and split',
  run: () => {
    const view = useStore.getState().view
    const idx = VIEWS.indexOf(view === 'walk' ? '3d' : view)
    const next = VIEWS[(idx + 1) % VIEWS.length] ?? '2d'
    useStore.getState().setView(next)
  },
})

registerShortcut({
  id: 'clear-selection',
  keys: 'escape',
  description: 'Clear selection',
  run: () => useStore.getState().select([]),
})

registerShortcut({
  id: 'fit',
  keys: 'f',
  description: 'Fit the plan and the 3D view',
  run: () => fitVisible(),
})

registerShortcut({
  id: 'delete',
  keys: 'delete',
  description: 'Delete selection',
  run: () => deleteSelection(),
})

registerShortcut({
  id: 'backspace',
  keys: 'backspace',
  description: 'Delete selection',
  run: () => deleteSelection(),
})

registerShortcut({
  id: 'rotate-or-room',
  keys: 'r',
  description: 'Rotate a selected item, or draw a room',
  run: () => {
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    const hasItem = level?.items.some((item) => state.selection.includes(item.id)) ?? false
    if (hasItem) rotateSelection()
    else state.setTool('room-rect')
  },
})

registerShortcut({ id: 'tool-select', keys: 'v', description: 'Select tool', run: () => useStore.getState().setTool('select') })
registerShortcut({ id: 'tool-wall', keys: 'w', description: 'Wall tool', run: () => useStore.getState().setTool('wall') })
registerShortcut({ id: 'tool-door', keys: 'd', description: 'Door tool', run: () => useStore.getState().setTool('door') })
registerShortcut({ id: 'tool-window', keys: 'n', description: 'Window tool', run: () => useStore.getState().setTool('window') })
registerShortcut({ id: 'tool-measure', keys: 'm', description: 'Measure tool', run: () => useStore.getState().setTool('measure') })

registerShortcut({
  id: 'help',
  keys: '?',
  description: 'Keyboard shortcuts',
  run: () => setHelpOpen(true),
})
