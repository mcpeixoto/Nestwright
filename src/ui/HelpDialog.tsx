import { useSyncExternalStore } from 'react'
import { AchievementsPage } from '../achievements/panel'
import { setHelpPage, useHelpPage } from '../achievements/helpPage'
import { formatShortcut, isHelpOpen, listShortcuts, setHelpOpen, subscribeHelp } from './shortcuts'
import { registerTopBarAction } from './topbar/registry'

function useHelpOpen(): boolean {
  return useSyncExternalStore(subscribeHelp, isHelpOpen, () => false)
}

export function ShortcutsButton() {
  const open = useHelpOpen()
  return (
    <button
      type="button"
      className={open ? 'on' : ''}
      onClick={() => {
        if (!open) setHelpPage('shortcuts')
        setHelpOpen(!open)
      }}
    >
      Shortcuts
    </button>
  )
}

export function HelpDialog() {
  const open = useHelpOpen()
  const page = useHelpPage()
  if (!open) return null
  return (
    <div className="modal-back" onClick={() => setHelpOpen(false)}>
      <div className="modal help-modal" role="dialog" aria-label="Help" onClick={(event) => event.stopPropagation()}>
        <div className="modal-switch" role="tablist" aria-label="Help">
          <button type="button" role="tab" aria-selected={page === 'shortcuts'} className={page === 'shortcuts' ? 'on' : ''} onClick={() => setHelpPage('shortcuts')}>
            Shortcuts
          </button>
          <button type="button" role="tab" aria-selected={page === 'achievements'} className={page === 'achievements' ? 'on' : ''} onClick={() => setHelpPage('achievements')}>
            Achievements
          </button>
        </div>
        {page === 'achievements' ? (
          <AchievementsPage />
        ) : (
          <>
            <h2>Shortcuts</h2>
            <ul className="shortcut-list">
              {listShortcuts().map((shortcut) => (
                <li key={shortcut.id}>
                  <span>{shortcut.description}</span>
                  <kbd>{formatShortcut(shortcut.keys)}</kbd>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

registerTopBarAction({
  id: 'shortcuts',
  label: 'Shortcuts',
  order: 80,
  Component: ShortcutsButton,
})
