import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { isDirty, subscribeDirty } from '../io/dirty'
import { useStore } from '../store'
import { noteReturnView } from '../view3d/rigs/walk'
import { useOpenPanelIds, usePanelList, togglePanel } from './panels/registry'
import { listTopBarActions, type TopBarAction } from './topbar/registry'
import './topbar/builtins'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'
import type { PanelDef } from './panels/registry'

const IN_MENU = new Set(['export-json', 'export', 'together', 'settings', 'photo'])
const MENU_PANELS = new Set(['budget', 'wishes', 'variants'])

const VIEWS = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
  { id: 'split', label: 'Split' },
  { id: 'walk', label: 'Walk' },
] as const

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
          <button type="button" key={panel.id} role="menuitem" className={openIds.includes(panel.id) ? 'on' : ''} onClick={() => togglePanel(panel.id)}>
            {tr(panel.title)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TopBar() {
  const tr = useTranslate()
  const name = useStore((s) => s.project.name)
  const dirty = useSyncExternalStore(subscribeDirty, isDirty, () => false)
  const view = useStore((s) => s.view)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const panels = usePanelList().filter((panel) => panel.placement === 'bottom' || panel.placement === 'floating')
  const open = useOpenPanelIds()
  const actions = listTopBarActions()
  const inline = actions.filter((action) => !IN_MENU.has(action.id))
  const menuActions = actions.filter((action) => IN_MENU.has(action.id))
  const iconPanels = panels.filter((panel) => !MENU_PANELS.has(panel.id))
  const menuPanels = panels.filter((panel) => MENU_PANELS.has(panel.id))

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
        <button type="button" disabled={!canUndo} onClick={() => useStore.getState().undo()}>
          <T k="Undo" />
        </button>
        <button type="button" disabled={!canRedo} onClick={() => useStore.getState().redo()}>
          <T k="Redo" />
        </button>
        {inline.map((action) =>
          action.Component ? (
            <action.Component key={action.id} />
          ) : (
            <button type="button" key={action.id} onClick={() => action.run?.()}>
              {tr(action.label)}
            </button>
          ),
        )}
        {iconPanels.map((panel) =>
          panel.icon ? (
            <button
              type="button"
              key={panel.id}
              className={open.includes(panel.id) ? 'icon-btn on' : 'icon-btn'}
              aria-label={tr(panel.title)}
              title={tr(panel.title)}
              onClick={() => togglePanel(panel.id)}
              dangerouslySetInnerHTML={{ __html: panel.icon }}
            />
          ) : (
            <button
              type="button"
              key={panel.id}
              className={open.includes(panel.id) ? 'on' : ''}
              onClick={() => togglePanel(panel.id)}
            >
              {tr(panel.title)}
            </button>
          ),
        )}
        <OverflowMenu actions={menuActions} panels={menuPanels} />
      </div>
    </header>
  )
}
