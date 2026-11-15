import { fill, translate } from '../i18n'
import { isDirty, subscribeDirty } from '../io/dirty'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { newProject, openProject, openReceivedFile, saveProject, saveProjectAs } from './actions'
import { enterEditor } from './session'

function syncChrome(): void {
  const name = useStore.getState().project.name
  const dirty = isDirty()
  if (typeof document !== 'undefined') {
    const base = `Nestwright — ${name}`
    document.title = dirty ? `${base} •` : base
  }
  const api = window.nestwright
  if (!api?.setEditorState) return
  const language = useSettings.getState().language
  api.setEditorState({
    dirty,
    prompt: {
      message: fill(language, 'Save changes to "{name}" before closing?', { name: name || translate(language, 'Untitled') }),
      save: translate(language, 'Save'),
      dontSave: translate(language, "Don't save"),
      cancel: translate(language, 'Cancel'),
    },
    menu: {
      file: translate(language, 'File'),
      new: translate(language, 'New'),
      open: translate(language, 'Open…'),
      save: translate(language, 'Save'),
      saveAs: translate(language, 'Save As…'),
      close: translate(language, 'Close Window'),
    },
  })
}

/** Window title, quit prompt, and the Electron File menu. The browser uses beforeunload. */
export function installDocumentSession(): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }
  if (typeof window !== 'undefined' && !window.nestwright) {
    window.addEventListener('beforeunload', onBeforeUnload)
  }

  syncChrome()
  const unsubDirty = subscribeDirty(syncChrome)
  const unsubStore = useStore.subscribe((state, prev) => {
    if (state.project.name !== prev.project.name) syncChrome()
  })
  const unsubSettings = useSettings.subscribe((state, prev) => {
    if (state.language !== prev.language) syncChrome()
  })

  const stops: Array<() => void> = []
  const api = typeof window !== 'undefined' ? window.nestwright : undefined
  if (api?.onMenu) {
    stops.push(
      api.onMenu((action) => {
        if (action === 'new') newProject()
        else if (action === 'open') {
          void openProject().then((ok) => {
            if (ok) enterEditor()
          })
        } else if (action === 'save') void saveProject()
        else if (action === 'save-as') void saveProjectAs()
      }),
    )
  }
  if (api?.onRequestSave) {
    stops.push(api.onRequestSave(() => saveProject()))
  }
  if (api?.onOpenPath) {
    stops.push(
      api.onOpenPath((file) => {
        if (openReceivedFile(file)) enterEditor()
      }),
    )
  }
  api?.notifyReady?.()

  return () => {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onBeforeUnload)
    unsubDirty()
    unsubStore()
    unsubSettings()
    for (const stop of stops) stop()
  }
}
