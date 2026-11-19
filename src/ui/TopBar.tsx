import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { isDirty, subscribeDirty } from '../io/dirty'
import { useStore } from '../store'
import { noteReturnView } from '../view3d/rigs/walk'
import { useOpenPanelIds, usePanelList, togglePanel } from './panels/registry'
import { listTopBarActions, type TopBarAction } from './topbar/registry'
import './topbar/builtins'
import './builtinShortcuts'
import { listShortcuts } from './shortcuts'
import { useTranslate } from '../i18n'
import type { PanelDef } from './panels/registry'
import { Tooltip } from './Tooltip'
import { NARROW_BAR } from './breakpoints'
import { useMediaQuery } from './useMediaQuery'
import { redoIcon, saveIcon, undoIcon, variantsIcon, wishesIcon } from './topbar/icons'

const FILE_MENU = ['new', 'open', 'export-json', 'settings', 'shortcuts']
const NARROW_ACTIONS = ['together', 'photo']
const CLAIMED = new Set([...FILE_MENU, ...NARROW_ACTIONS, 'home', 'save', 'export'])

const VIEWS = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
  { id: 'split', label: 'Split' },
  { id: 'walk', label: 'Walk' },
] as const

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

function pickActions(actions: TopBarAction[], ids: readonly string[]): TopBarAction[] {
  const byId = new Map(actions.map((action) => [action.id, action]))
  return ids.flatMap((id) => {
    const action = byId.get(id)
    return action ? [action] : []
  })
}

function OverflowMenu({ actions, panels }: { actions: TopBarAction[]; panels: PanelDef[] }) {
  const tr = useTranslate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const openIds = useOpenPanelIds()
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])
  if (actions.length === 0 && panels.length === 0) return null
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="icon-btn" aria-expanded={open} aria-label={tr('More')} title={tr('More')} onClick={() => setOpen((value) => !value)}>
        ⋯
      </button>
      <div className={open ? 'menu-pop' : 'menu-pop closed'} role="menu">
        {actions.map((action) =>
          action.Component ? (
            <action.Component key={action.id} />
          ) : (
            <button
              type="button"
              key={action.id}
              role="menuitem"
              onClick={() => {
                action.run?.()
                setOpen(false)
              }}
            >
              {tr(action.label)}
            </button>
          ),
        )}
        {panels.map((panel) => (
          <button
            type="button"
            key={panel.id}
            role="menuitem"
            className={openIds.includes(panel.id) ? 'on' : ''}
            onClick={() => {
              togglePanel(panel.id)
              setOpen(false)
            }}
          >
            {tr(panel.title)}
          </button>
        ))}
      </div>
    </div>
  )
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

function LabeledButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string
  icon: string
  pressed?: boolean
  onClick: () => void
}) {
  const tr = useTranslate()
  const name = tr(label)
  return (
    <Tooltip label={name}>
      <button type="button" className={pressed ? 'tb-btn on' : 'tb-btn'} aria-label={name} aria-pressed={pressed} onClick={onClick}>
        <span className="tb-glyph" dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="tb-label">{name}</span>
      </button>
    </Tooltip>
  )
}

function LoosePanelButton({ panel, open }: { panel: PanelDef; open: boolean }) {
  const tr = useTranslate()
  if (panel.icon) {
    return (
      <button
        type="button"
        className={open ? 'icon-btn on' : 'icon-btn'}
        aria-label={tr(panel.title)}
        title={tr(panel.title)}
        onClick={() => togglePanel(panel.id)}
        dangerouslySetInnerHTML={{ __html: panel.icon }}
      />
    )
  }
  return (
    <button type="button" className={open ? 'on' : ''} onClick={() => togglePanel(panel.id)}>
      {tr(panel.title)}
    </button>
  )
}

export function TopBar() {
  const tr = useTranslate()
  const name = useStore((s) => s.project.name)
  const dirty = useSyncExternalStore(subscribeDirty, isDirty, () => false)
  const view = useStore((s) => s.view)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const narrow = useMediaQuery(NARROW_BAR)
  const hasBrief = useStore((s) => s.project.brief != null)
  const panels = usePanelList().filter(
    (panel) => (panel.placement === 'bottom' || panel.placement === 'floating') && (panel.id !== 'brief' || hasBrief),
  )
  const open = useOpenPanelIds()
  const actions = listTopBarActions()
  const wishes = panels.find((panel) => panel.id === 'wishes')
  const variants = panels.find((panel) => panel.id === 'variants')
  const loose = panels.filter((panel) => panel.id !== 'wishes' && panel.id !== 'variants')
  const home = actions.find((action) => action.id === 'home')
  const save = actions.find((action) => action.id === 'save')
  const together = actions.find((action) => action.id === 'together')
  const photo = actions.find((action) => action.id === 'photo')
  const exportAction = actions.find((action) => action.id === 'export')
  const menuIds = narrow ? [...FILE_MENU, ...NARROW_ACTIONS] : FILE_MENU
  const menuActions = [...pickActions(actions, menuIds), ...actions.filter((action) => !CLAIMED.has(action.id))]
  const menuPanels = narrow && variants ? [variants] : []

  return (
    <header className="topbar">
      <div className="wordmark">Nestwright</div>
      <div className="project-title">
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
        {dirty && <span className="unsaved-dot" role="img" aria-label={tr('Unsaved changes')} title={tr('Unsaved changes')} />}
      </div>
      <div className="view-switch" role="group" aria-label={tr('View')}>
        {VIEWS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={view === item.id ? 'on' : ''}
            onClick={() => {
              if (item.id === 'walk') noteReturnView(useStore.getState().view)
              useStore.getState().setView(item.id)
            }}
          >
            {tr(item.label)}
          </button>
        ))}
      </div>
      <div className="top-actions">
        <div className="top-cluster history">
          <HistoryButton id="undo" fallback="mod+z" label="Undo" icon={undoIcon} enabled={canUndo} onClick={() => useStore.getState().undo()} />
          <HistoryButton id="redo" fallback="mod+shift+z" label="Redo" icon={redoIcon} enabled={canRedo} onClick={() => useStore.getState().redo()} />
        </div>
        <span className="top-divider" aria-hidden="true" />
        <div className="top-cluster design">
          {wishes && <LabeledButton label={wishes.title} icon={wishesIcon} pressed={open.includes(wishes.id)} onClick={() => togglePanel(wishes.id)} />}
          {!narrow && variants && (
            <LabeledButton label={variants.title} icon={variantsIcon} pressed={open.includes(variants.id)} onClick={() => togglePanel(variants.id)} />
          )}
          {!narrow && together?.Component && <together.Component />}
          {!narrow && photo?.Component && <photo.Component />}
          {exportAction?.Component && <exportAction.Component />}
          {loose.map((panel) => (
            <LoosePanelButton key={panel.id} panel={panel} open={open.includes(panel.id)} />
          ))}
        </div>
        <span className="top-divider" aria-hidden="true" />
        <div className="top-cluster file">
          {save && <LabeledButton label={save.label} icon={saveIcon} onClick={() => save.run?.()} />}
          {home?.Component && <home.Component />}
          <OverflowMenu actions={menuActions} panels={menuPanels} />
        </div>
      </div>
    </header>
  )
}
