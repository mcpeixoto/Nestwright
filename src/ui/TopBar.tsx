import { useState } from 'react'
import { useStore } from '../store'
import { noteReturnView } from '../view3d/rigs/walk'
import { useOpenPanelIds, usePanelList, togglePanel } from './panels/registry'
import { listTopBarActions } from './topbar/registry'
import './topbar/builtins'
import './builtinShortcuts'
import { listShortcuts, setHelpOpen } from './shortcuts'
import { useTranslate } from '../i18n'
import { Tooltip } from './Tooltip'
import { saveStateLabel, useSaveState } from './saveState'
import { redoIcon, undoIcon } from './topbar/icons'
import { DropMenu, type DropMenuItem } from './topbar/DropMenu'
import { PlanPdfDialog } from './topbar/PlanPdfDialog'
import { exportHouseGlb } from '../io/export/glb'
import { exportPlanPng, exportViewImage } from '../io/export/images'
import { setSettingsOpen } from './settingsDialogState'
import { setHelpPage } from '../achievements/helpPage'

const VIEWS = [
  { id: '2d', label: 'Plan' },
  { id: '3d', label: '3D' },
  { id: 'walk', label: 'Walk' },
] as const

const FILE_IDS = ['new', 'open', 'save', 'save-as', 'export-json'] as const

function macSymbols(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent)
}

function chordText(keys: string): string {
  const mac = macSymbols()
  const parts = keys
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  const key = parts[parts.length - 1] ?? ''
  const mods = new Set(parts.slice(0, -1))
  const glyphs: string[] = []
  if (mods.has('shift')) glyphs.push(mac ? '⇧' : 'Shift')
  if (mods.has('alt')) glyphs.push(mac ? '⌥' : 'Alt')
  if (mods.has('mod') || mods.has('meta') || mods.has('ctrl')) glyphs.push(mac ? '⌘' : 'Ctrl')
  if (key) glyphs.push(key.length === 1 ? key.toUpperCase() : key)
  return mac ? glyphs.join('') : glyphs.join('+')
}

function historyTip(id: string, fallback: string, name: string): string {
  const keys = listShortcuts().find((item) => item.id === id)?.keys ?? fallback
  return `${name} (${chordText(keys)})`
}

function HistoryButton({
  id,
  fallback,
  label,
  icon,
  enabled,
  onClick,
}: {
  id: string
  fallback: string
  label: string
  icon: string
  enabled: boolean
  onClick: () => void
}) {
  const tr = useTranslate()
  const name = tr(label)
  return (
    <Tooltip label={historyTip(id, fallback, name)}>
      <button
        type="button"
        className="icon-btn"
        aria-label={name}
        aria-disabled={!enabled}
        onClick={() => {
          if (enabled) onClick()
        }}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    </Tooltip>
  )
}

export function TopBar() {
  const tr = useTranslate()
  const name = useStore((s) => s.project.name)
  const saveState = useSaveState()
  const label = saveStateLabel(saveState)
  const view = useStore((s) => s.view)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const hasBrief = useStore((s) => s.project.brief != null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const open = useOpenPanelIds()
  const panels = usePanelList().filter(
    (panel) => panel.placement === 'floating' && panel.id !== 'brush' && (panel.id !== 'brief' || hasBrief),
  )
  const actions = listTopBarActions()
  const byId = new Map(actions.map((action) => [action.id, action]))
  const fromRegistry = (id: string): DropMenuItem[] => {
    const action = byId.get(id)
    const run = action?.run
    return action && run ? [{ id: action.id, label: action.label, run }] : []
  }
  const together = byId.get('together')

  const planItems: DropMenuItem[] = panels.map((panel) => ({
    id: panel.id,
    label: panel.title,
    checked: open.includes(panel.id),
    run: () => togglePanel(panel.id),
  }))
  const shareItems: DropMenuItem[] = [
    ...fromRegistry('together'),
    ...fromRegistry('photo'),
    { id: 'image', label: 'Image', run: () => void exportViewImage(1920, 1080) },
    { id: 'pdf', label: 'Floor plan PDF', run: () => setPdfOpen(true) },
    { id: 'png', label: 'Plan PNG', run: () => void exportPlanPng() },
    { id: 'glb', label: 'GLB', run: () => void exportHouseGlb() },
  ]
  const menuItems: DropMenuItem[] = [
    ...FILE_IDS.flatMap(fromRegistry),
    { id: 'settings', label: 'Settings', run: () => setSettingsOpen(true) },
    {
      id: 'help',
      label: 'Help',
      run: () => {
        setHelpPage('shortcuts')
        setHelpOpen(true)
      },
    },
  ]

  return (
    <header className="topbar">
      <div className="wordmark">Nestwright</div>
      <div className="project-title">
        <Tooltip label={tr('Project name')}>
          <input
            className="project-name"
            aria-label={tr('Project name')}
            value={name}
            onChange={(event) => {
              const next = event.target.value
              useStore.getState().apply('Rename', (draft) => {
                draft.name = next
              })
            }}
          />
        </Tooltip>
        <span className={saveState.dirty ? 'save-state dirty' : 'save-state'} role="status">
          {label ? tr(label) : ''}
        </span>
      </div>
      <div className="top-actions">
        <div className="view-switch" role="group" aria-label={tr('View')}>
          {VIEWS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? 'on' : ''}
              aria-pressed={view === item.id}
              data-tour={item.id === '3d' ? 'view-3d' : item.id === 'walk' ? 'view-walk' : undefined}
              onClick={() => {
                if (item.id === 'walk') noteReturnView(useStore.getState().view)
                useStore.getState().setView(item.id)
              }}
            >
              {tr(item.label)}
            </button>
          ))}
        </div>
        <Tooltip label={tr('Plan + 3D')}>
          <button
            type="button"
            className={view === 'split' ? 'tb-btn on' : 'tb-btn'}
            aria-pressed={view === 'split'}
            onClick={() => useStore.getState().setView(view === 'split' ? '2d' : 'split')}
          >
            {tr('Plan + 3D')}
          </button>
        </Tooltip>
        <div className="top-cluster history">
          <HistoryButton id="undo" fallback="mod+z" label="Undo" icon={undoIcon} enabled={canUndo} onClick={() => useStore.getState().undo()} />
          <HistoryButton id="redo" fallback="mod+shift+z" label="Redo" icon={redoIcon} enabled={canRedo} onClick={() => useStore.getState().redo()} />
        </div>
        <span className="top-divider" aria-hidden="true" />
        <div className="top-cluster menus">
          <DropMenu label="Plan menu" text="Plan" items={planItems} />
          <DropMenu label="Share" items={shareItems} />
          <DropMenu label="Menu" icon="menu" items={menuItems} />
        </div>
      </div>
      {together?.Component && <together.Component />}
      {pdfOpen && <PlanPdfDialog onClose={() => setPdfOpen(false)} />}
    </header>
  )
}
