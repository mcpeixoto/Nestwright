import { useSyncExternalStore } from 'react'
import { setHelpPage } from '../achievements/helpPage'
import { useTranslate } from '../i18n'
import { T } from '../i18n/T'
import { getPlatform } from '../platform'
import { newProject, openProject, saveProject, saveProjectAs } from './actions'
import { Modal } from './Modal'
import { isPauseOpen, setPauseOpen, subscribePause } from './pauseMenuState'
import { openHome } from './session'
import { setSettingsOpen } from './settingsDialogState'
import { setHelpOpen } from './shortcuts'

export function PauseMenu() {
  const open = useSyncExternalStore(subscribePause, isPauseOpen, () => false)
  const tr = useTranslate()
  if (!open) return null

  const act = (action: () => void) => {
    setPauseOpen(false)
    action()
  }

  return (
    <Modal className="pause-menu" label={tr('Paused')} onClose={() => setPauseOpen(false)}>
      <h2>
        <T k="Paused" />
      </h2>
      <div className="menu-list">
        <button type="button" onClick={() => act(() => {})}>
          <T k="Resume" />
        </button>
        <button type="button" onClick={() => act(() => void saveProject())}>
          <T k="Save" />
        </button>
        <button type="button" onClick={() => act(() => void saveProjectAs())}>
          <T k="Save As…" />
        </button>
        <button type="button" onClick={() => act(() => void openProject())}>
          <T k="Open…" />
        </button>
        <button type="button" onClick={() => act(() => newProject())}>
          <T k="New house" />
        </button>
        <button type="button" onClick={() => act(() => setSettingsOpen(true))}>
          <T k="Settings" />
        </button>
        <button
          type="button"
          onClick={() =>
            act(() => {
              setHelpPage('shortcuts')
              setHelpOpen(true)
            })
          }
        >
          <T k="Help" />
        </button>
        <button type="button" onClick={() => act(() => openHome())}>
          <T k="Main menu" />
        </button>
        {getPlatform().isElectron ? (
          <button type="button" onClick={() => act(() => void getPlatform().quit?.())}>
            <T k="Quit" />
          </button>
        ) : null}
      </div>
    </Modal>
  )
}
