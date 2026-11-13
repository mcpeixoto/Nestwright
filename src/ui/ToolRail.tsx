import { useState } from 'react'
import { useTranslate } from '../i18n'
import { useStore } from '../store'
import { listTools } from '../tools/registry'
import { togglePanel, useOpenPanelIds, usePanelList } from './panels/registry'
import { railIconTool } from './railDefaults'

const GROUPS = [
  { id: 'build', label: 'Build' },
  { id: 'openings', label: 'Openings' },
  { id: 'interior', label: 'Interior' },
  { id: 'outside', label: 'Outside' },
  { id: 'measure', label: 'Measure' },
] as const

const lastToolByGroup: Record<string, string> = {}
const chosenGroups = new Set<string>()

useStore.subscribe((state, prev) => {
  if (state.tool === prev.tool) return
  const item = listTools().find((entry) => entry.id === state.tool)
  if (!item || item.id === 'select' || item.id === 'pan' || !chosenGroups.has(item.group)) return
  lastToolByGroup[item.group] = item.id
})

export function ToolRail() {
  const tool = useStore((s) => s.tool)
  const apartment = useStore((s) => s.project.kind === 'apartment')
  const tr = useTranslate()
  const select = listTools().find((item) => item.id === 'select')
  const tools = listTools().filter((item) => {
    if (item.id === 'place-item' || item.id === 'select' || item.id === 'pan') return false
    if (apartment && item.group === 'outside') return false
    if (!apartment && item.id === 'balcony') return false
    return true
  })
  const panels = usePanelList().filter(
    (panel) => (panel.placement === 'left' || panel.placement === 'right') && !(apartment && panel.id === 'outside'),
  )
  const open = useOpenPanelIds()
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  return (
    <aside className="rail">
      {select && (
        <button
          type="button"
          className={tool === select.id ? 'tool on' : 'tool'}
          title={select.shortcut ? `${tr(select.label)} (${select.shortcut})` : tr(select.label)}
          aria-label={tr(select.label)}
          onClick={() => useStore.getState().setTool(select.id)}
          dangerouslySetInnerHTML={{ __html: select.icon }}
        />
      )}
      {GROUPS.map((group) => {
        const groupTools = tools.filter((item) => item.group === group.id)
        const iconTool = railIconTool(groupTools, group.id, tool, chosenGroups.has(group.id) ? lastToolByGroup[group.id] : undefined)
        if (!iconTool) return null
        const active = groupTools.some((item) => item.id === tool)
        return (
          <div
            key={group.id}
            className="rail-group"
            onMouseEnter={() => setOpenGroup(group.id)}
            onMouseLeave={() => setOpenGroup((current) => (current === group.id ? null : current))}
          >
            <button
              type="button"
              className={active ? 'tool on' : 'tool'}
              title={tr(group.label)}
              aria-label={tr(group.label)}
              aria-expanded={openGroup === group.id}
              onClick={() => {
                chosenGroups.add(group.id)
                lastToolByGroup[group.id] = iconTool.id
                useStore.getState().setTool(iconTool.id)
                if (group.id === 'interior') useStore.getState().setLibraryOpen(true)
                setOpenGroup(group.id)
              }}
              dangerouslySetInnerHTML={{ __html: iconTool.icon }}
            />
            {openGroup === group.id && (
              <div className="rail-flyout" role="menu" aria-label={tr(group.label)}>
                {groupTools.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    role="menuitem"
                    className={tool === item.id ? 'on' : ''}
                    onClick={() => {
                      chosenGroups.add(group.id)
                      lastToolByGroup[group.id] = item.id
                      useStore.getState().setTool(item.id)
                    }}
                  >
                    <span className="flyout-icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
                    <span>{tr(item.label)}</span>
                    {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <div className="rail-panels">
        {panels.map((panel) =>
          panel.icon ? (
            <button
              type="button"
              key={panel.id}
              className={open.includes(panel.id) ? 'tool on' : 'tool'}
              title={panel.shortcut ? `${tr(panel.title)} (${panel.shortcut})` : tr(panel.title)}
              aria-pressed={open.includes(panel.id)}
              onClick={() => togglePanel(panel.id)}
              dangerouslySetInnerHTML={{ __html: panel.icon }}
            />
          ) : (
            <button
              type="button"
              key={panel.id}
              className={open.includes(panel.id) ? 'tool on' : 'tool'}
              title={tr(panel.title)}
              aria-pressed={open.includes(panel.id)}
              onClick={() => togglePanel(panel.id)}
            >
              {tr(panel.title).slice(0, 1)}
            </button>
          ),
        )}
      </div>
    </aside>
  )
}
