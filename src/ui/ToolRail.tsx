import { Fragment, useEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslate } from '../i18n'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { listTools } from '../tools/registry'
import { setPanelOpen, togglePanel, useOpenPanelIds, usePanelList } from './panels/registry'
import { railIconTool } from './railDefaults'
import { Tooltip } from './Tooltip'

const GROUPS = [
  { id: 'build', label: 'Build' },
  { id: 'openings', label: 'Doors & windows' },
  { id: 'outside', label: 'Garden' },
] as const

const lastToolByGroup: Record<string, string> = {}
const chosenGroups = new Set<string>()

useStore.subscribe((state, prev) => {
  if (state.tool === prev.tool) return
  const item = listTools().find((entry) => entry.id === state.tool)
  if (!item || item.id === 'select' || item.id === 'pan' || !chosenGroups.has(item.group)) return
  lastToolByGroup[item.group] = item.id
})

function tipText(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label
}

function railButtons(toolbar: HTMLElement): HTMLButtonElement[] {
  return [...toolbar.querySelectorAll<HTMLButtonElement>('button')].filter((button) => !button.closest('[role="menu"]'))
}

function groupTrigger(target: HTMLElement): HTMLButtonElement | null {
  const group = target.closest('.rail-group')
  if (!group) return null
  return [...group.querySelectorAll<HTMLButtonElement>('button')].find((button) => !button.closest('[role="menu"]')) ?? null
}

export function ToolRail() {
  const tool = useStore((s) => s.tool)
  const apartment = useStore((s) => s.project.kind === 'apartment')
  const showLabels = useSettings((s) => s.railLabels)
  const tr = useTranslate()
  const select = listTools().find((item) => item.id === 'select')
  const tools = listTools().filter((item) => {
    if (item.hidden || item.id === 'place-item' || item.id === 'select' || item.id === 'pan') return false
    if (apartment && item.group === 'outside') return false
    if (!apartment && item.id === 'balcony') return false
    return true
  })
  const allPanels = usePanelList()
  const libraryIcon = allPanels.find((panel) => panel.id === 'library')?.icon
  const paintTool = listTools().find((item) => item.id === 'paint')
  const measureTool = listTools().find((item) => item.id === 'measure')
  const panels = allPanels.filter(
    (panel) => (panel.placement === 'left' || panel.placement === 'right') && panel.id !== 'outside' && panel.id !== 'library',
  )
  const open = useOpenPanelIds()
  const hostRef = useRef<HTMLElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const [pinnedGroup, setPinnedGroup] = useState<string | null>(null)
  const openGroup = pinnedGroup

  function dismiss() {
    setPinnedGroup(null)
  }

  useEffect(() => {
    const id = pendingFocus.current
    if (!id || id !== openGroup) return
    const item = hostRef.current?.querySelector<HTMLElement>(`[data-group="${id}"] [role="menuitem"]`)
    if (!item) return
    item.focus()
    pendingFocus.current = null
  }, [openGroup])

  useEffect(() => {
    if (!openGroup) return
    const onPointer = (event: PointerEvent) => {
      const group = hostRef.current?.querySelector(`[data-group="${openGroup}"]`)
      if (event.target instanceof Node && group?.contains(event.target)) return
      dismiss()
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
      dismiss()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onEscape)
    }
  }, [openGroup])

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const menu = target.closest<HTMLElement>('[role="menu"]')
    if (menu) {
      const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      const index = items.indexOf(target)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
        items[next]?.focus()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        groupTrigger(target)?.focus()
        dismiss()
      }
      return
    }
    const buttons = railButtons(event.currentTarget)
    const index = buttons.indexOf(target as HTMLButtonElement)
    if (index < 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length
      buttons[next]?.focus()
      return
    }
    if (event.key === 'ArrowRight') {
      const group = target.closest<HTMLElement>('.rail-group')
      const id = group?.dataset.group
      if (!id) return
      event.preventDefault()
      pendingFocus.current = id
      setPinnedGroup(id)
      if (openGroup === id) group?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
      return
    }
    if (event.key === 'Escape' && openGroup) {
      event.preventDefault()
      event.stopPropagation()
      dismiss()
    }
  }

  function onFocus(event: ReactFocusEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement) || !openGroup) return
    if (target.closest('[role="menu"]')) return
    const groupId = target.closest<HTMLElement>('.rail-group')?.dataset.group
    if (groupId === openGroup) return
    dismiss()
  }

  function renderGroup(group: (typeof GROUPS)[number]) {
    const groupTools = tools.filter((item) => item.group === group.id)
    const iconTool = railIconTool(groupTools, group.id, tool, chosenGroups.has(group.id) ? lastToolByGroup[group.id] : undefined)
    if (!iconTool) return null
    const active = groupTools.some((item) => item.id === tool)
    const expanded = openGroup === group.id
    return (
      <div className="rail-group" data-group={group.id}>
        <RailButton
          label={tr(group.label)}
          className={active ? 'tool on' : 'tool'}
          icon={iconTool.icon}
          caption={showLabels ? tr(group.label) : undefined}
          expanded={expanded}
          onClick={() => {
            chosenGroups.add(group.id)
            lastToolByGroup[group.id] = iconTool.id
            useStore.getState().setTool(iconTool.id)
            if (group.id === 'outside') setPanelOpen('outside', true)
            setPinnedGroup(pinnedGroup === group.id ? null : group.id)
          }}
        />
        {expanded && (
          <div className="rail-flyout" role="menu" aria-label={tr(group.label)}>
            {groupTools.map((item) => (
              <Tooltip key={item.id} label={tipText(tr(item.label), item.shortcut)}>
                <button
                  type="button"
                  role="menuitem"
                  className={tool === item.id ? 'on' : ''}
                  aria-label={tr(item.label)}
                  onClick={() => {
                    chosenGroups.add(group.id)
                    lastToolByGroup[group.id] = item.id
                    useStore.getState().setTool(item.id)
                    dismiss()
                  }}
                >
                  <span className="flyout-icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
                  <span>{tr(item.label)}</span>
                  {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      ref={hostRef}
      className={showLabels ? 'rail with-labels' : 'rail'}
      role="toolbar"
      aria-label={tr('Tools')}
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {select && (
        <RailButton
          label={tr(select.label)}
          shortcut={select.shortcut}
          className={tool === select.id ? 'tool on' : 'tool'}
          icon={select.icon}
          caption={showLabels ? tr(select.label) : undefined}
          onClick={() => useStore.getState().setTool(select.id)}
        />
      )}
      {GROUPS.map((group) => (
        <Fragment key={group.id}>
          {renderGroup(group)}
          {group.id === 'openings' && (
            <RailButton
              label={tr('Furniture')}
              className={open.includes('library') ? 'tool on' : 'tool'}
              icon={libraryIcon}
              caption={showLabels ? tr('Furniture') : undefined}
              pressed={open.includes('library')}
              dataTour="library"
              onClick={() => togglePanel('library')}
            />
          )}
          {group.id === 'openings' && paintTool && (
            <RailButton
              label={tr(paintTool.label)}
              shortcut={paintTool.shortcut}
              className={tool === paintTool.id ? 'tool on' : 'tool'}
              icon={paintTool.icon}
              caption={showLabels ? tr(paintTool.label) : undefined}
              onClick={() => useStore.getState().setTool(paintTool.id)}
            />
          )}
        </Fragment>
      ))}
      {measureTool && (
        <RailButton
          label={tr(measureTool.label)}
          shortcut={measureTool.shortcut}
          className={tool === measureTool.id ? 'tool on' : 'tool'}
          icon={measureTool.icon}
          caption={showLabels ? tr(measureTool.label) : undefined}
          onClick={() => useStore.getState().setTool(measureTool.id)}
        />
      )}
      <div className="rail-panels">
        {panels.map((panel) => (
          <RailButton
            key={panel.id}
            label={tr(panel.title)}
            shortcut={panel.shortcut}
            className={open.includes(panel.id) ? 'tool on' : 'tool'}
            icon={panel.icon}
            caption={showLabels ? tr(panel.title) : undefined}
            pressed={open.includes(panel.id)}
            onClick={() => togglePanel(panel.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function RailButton({
  label,
  shortcut,
  className,
  icon,
  caption,
  expanded,
  pressed,
  dataTour,
  onClick,
}: {
  label: string
  shortcut?: string
  className: string
  icon?: string
  caption?: string
  expanded?: boolean
  pressed?: boolean
  dataTour?: string
  onClick: () => void
}) {
  return (
    <Tooltip label={tipText(label, shortcut)} disabled={expanded}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={expanded}
        aria-pressed={pressed}
        data-tour={dataTour}
        onClick={onClick}
      >
        {icon ? (
          <span className="tool-glyph" dangerouslySetInnerHTML={{ __html: icon }} />
        ) : (
          <span className="tool-glyph">{label.slice(0, 1)}</span>
        )}
        {caption ? <span className="rail-label">{caption}</span> : null}
      </button>
    </Tooltip>
  )
}
