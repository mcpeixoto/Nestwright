import { useSyncExternalStore } from 'react'
import { formatShortcut, isHelpOpen, listShortcuts, setHelpOpen, subscribeHelp } from './shortcuts'
import { registerTopBarAction } from './topbar/registry'

function useHelpOpen(): boolean {
  return useSyncExternalStore(subscribeHelp, isHelpOpen, () => false)
}

export function ShortcutsButton() {
  const open = useHelpOpen()
  return (
    <button type="button" className={open ? 'on' : ''} onClick={() => setHelpOpen(!open)}>
      Shortcuts
    </button>
  )
}

export function HelpDialog() {
  const open = useHelpOpen()
  if (!open) return null
  return (
    <div className="modal-back" onClick={() => setHelpOpen(false)}>
      <div className="modal" role="dialog" aria-label="Keyboard shortcuts" onClick={(event) => event.stopPropagation()}>
        <h2>Shortcuts</h2>
        <ul className="shortcut-list">
          {listShortcuts().map((shortcut) => (
            <li key={shortcut.id}>
              <span>{shortcut.description}</span>
              <kbd>{formatShortcut(shortcut.keys)}</kbd>
            </li>
          ))}
        </ul>
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
