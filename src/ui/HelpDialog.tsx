import { useSyncExternalStore } from 'react'
import { AchievementsPage } from '../achievements/panel'
import { setHelpPage, useHelpPage } from '../achievements/helpPage'
import { useTranslate } from '../i18n'
import { T } from '../i18n/T'
import { CreditsPage } from './CreditsPage'
import { listTools } from '../tools/registry'
import { replayTour } from './onboarding/Tour'
import { formatShortcut, isHelpOpen, listShortcuts, setHelpOpen, subscribeHelp } from './shortcuts'
import { Modal } from './Modal'
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
    <button
      type="button"
      className={open ? 'icon-btn on' : 'icon-btn'}
      title={tr('Help')}
      aria-label={tr('Help')}
      onClick={() => {
        if (!open) setHelpPage('shortcuts')
        setHelpOpen(!open)
      }}
    >
      ?
    </button>
  )
}

function ShortcutsPage() {
  const tr = useTranslate()
  const global = listShortcuts()
  const used = new Set(global.map((shortcut) => shortcut.keys.toLowerCase()))
  const tools = listTools().filter((tool) => tool.shortcut && !used.has(tool.shortcut.toLowerCase()))
  return (
    <>
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
    </>
  )
}

export function HelpDialog() {
  const open = useHelpOpen()
  const page = useHelpPage()
  const tr = useTranslate()
  if (!open) return null
  return (
    <Modal className="help-modal" label={tr('Help')} onClose={() => setHelpOpen(false)}>
        <div className="modal-switch" role="tablist" aria-label={tr('Help')}>
          <button
            type="button"
            role="tab"
            aria-selected={page === 'shortcuts'}
            className={page === 'shortcuts' ? 'on' : ''}
            onClick={() => setHelpPage('shortcuts')}
          >
            {tr('Shortcuts')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={page === 'achievements'}
            className={page === 'achievements' ? 'on' : ''}
            onClick={() => setHelpPage('achievements')}
          >
            {tr('Achievements')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={page === 'credits'}
            className={page === 'credits' ? 'on' : ''}
            onClick={() => setHelpPage('credits')}
          >
            {tr('Credits')}
          </button>
        </div>
        {page === 'achievements' ? <AchievementsPage /> : page === 'credits' ? <CreditsPage /> : <ShortcutsPage />}
    </Modal>
  )
}

registerTopBarAction({
  id: 'shortcuts',
  label: 'Help',
  order: 80,
  Component: ShortcutsButton,
})
