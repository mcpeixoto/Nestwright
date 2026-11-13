import { useSyncExternalStore } from 'react'
import { listTools } from '../tools/registry'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'
import { replayTour } from './onboarding/Tour'
import { formatShortcut, isHelpOpen, listShortcuts, setHelpOpen, subscribeHelp } from './shortcuts'
import { registerTopBarAction } from './topbar/registry'

function useHelpOpen(): boolean {
  return useSyncExternalStore(subscribeHelp, isHelpOpen, () => false)
}

function describe(description: string, tr: (key: string) => string): string {
  if (description.startsWith('Toggle ')) return `${tr('Toggle')} ${tr(description.slice('Toggle '.length))}`
  return tr(description)
}

export function ShortcutsButton() {
  const open = useHelpOpen()
  const tr = useTranslate()
  return (
    <button type="button" className={open ? 'on' : ''} onClick={() => setHelpOpen(!open)}>
      {tr('Shortcuts')}
    </button>
  )
}

export function HelpDialog() {
  const open = useHelpOpen()
  const tr = useTranslate()
  if (!open) return null
  const global = listShortcuts()
  const used = new Set(global.map((shortcut) => shortcut.keys.toLowerCase()))
  const tools = listTools().filter((tool) => tool.shortcut && !used.has(tool.shortcut.toLowerCase()))
  return (
    <div className="modal-back" onClick={() => setHelpOpen(false)}>
      <div className="modal" role="dialog" aria-label={tr('Keyboard shortcuts')} onClick={(event) => event.stopPropagation()}>
        <h2>
          <T k="Shortcuts" />
        </h2>
        <h3>
          <T k="General" />
        </h3>
        <ul className="shortcut-list">
          {global.map((shortcut) => (
            <li key={shortcut.id}>
              <span>{describe(shortcut.description, tr)}</span>
              <kbd>{formatShortcut(shortcut.keys)}</kbd>
            </li>
          ))}
        </ul>
        {tools.length > 0 && (
          <>
            <h3>
              <T k="Tools" />
            </h3>
            <ul className="shortcut-list">
              {tools.map((tool) => (
                <li key={tool.id}>
                  <span>{tr(tool.label)}</span>
                  <kbd>{tool.shortcut}</kbd>
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" onClick={() => replayTour()}>
          <T k="Replay the tour" />
        </button>
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
