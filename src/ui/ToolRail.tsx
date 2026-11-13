import { useState } from 'react'
import { useStore } from '../store'
import { listTools } from '../tools/registry'
import type { Tool } from '../tools/types'
import { togglePanel, useOpenPanelIds, usePanelList } from './panels/registry'

const GROUPS = [
  { id: 'build', label: 'Build' },
  { id: 'openings', label: 'Openings' },
  { id: 'interior', label: 'Interior' },
  { id: 'outside', label: 'Outside' },
  { id: 'measure', label: 'Measure' },
] as const

const lastToolByGroup: Record<string, string> = {}

useStore.subscribe((state, prev) => {
  if (state.tool === prev.tool) return
  const item = listTools().find((entry) => entry.id === state.tool)
  if (item && item.id !== 'select') lastToolByGroup[item.group] = item.id
})

function shownTool(tools: Tool[], groupId: string, activeId: string, remembered: string | undefined): Tool | undefined {
  return tools.find((item) => item.id === activeId) ?? tools.find((item) => item.id === remembered) ?? tools.find((item) => item.group === groupId)
}

export function ToolRail() {
  const tool = useStore((s) => s.tool)
  const tools = listTools().filter((item) => item.id !== 'place-item' && item.id !== 'select')
  const select = listTools().find((item) => item.id === 'select')
  const panels = usePanelList().filter((panel) => panel.placement === 'left' || panel.placement === 'right')
  const open = useOpenPanelIds()
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  return (
    <aside className="rail">
      {select && (
        <button
          type="button"
          className={tool === select.id ? 'tool on' : 'tool'}
          title={select.shortcut ? `${select.label} (${select.shortcut})` : select.label}
          aria-label={select.label}
          onClick={() => useStore.getState().setTool(select.id)}
          dangerouslySetInnerHTML={{ __html: select.icon }}
        />
      )}
      {GROUPS.map((group) => {
        const groupTools = tools.filter((item) => item.group === group.id)
        const iconTool = shownTool(groupTools, group.id, tool, lastToolByGroup[group.id])
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
              title={group.label}
              aria-label={group.label}
              aria-expanded={openGroup === group.id}
              onClick={() => {
                useStore.getState().setTool(iconTool.id)
                setOpenGroup(group.id)
              }}
              dangerouslySetInnerHTML={{ __html: iconTool.icon }}
            />
            {openGroup === group.id && (
              <div className="rail-flyout" role="menu" aria-label={group.label}>
                {groupTools.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    role="menuitem"
                    className={tool === item.id ? 'on' : ''}
                    onClick={() => useStore.getState().setTool(item.id)}
                  >
                    <span className="flyout-icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
                    <span>{item.label}</span>
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
              title={panel.shortcut ? `${panel.title} (${panel.shortcut})` : panel.title}
              aria-pressed={open.includes(panel.id)}
              onClick={() => togglePanel(panel.id)}
              dangerouslySetInnerHTML={{ __html: panel.icon }}
            />
          ) : (
            <button
              type="button"
              key={panel.id}
              className={open.includes(panel.id) ? 'tool on' : 'tool'}
              title={panel.title}
              aria-pressed={open.includes(panel.id)}
              onClick={() => togglePanel(panel.id)}
            >
              {panel.title.slice(0, 1)}
            </button>
          ),
        )}
      </div>
    </aside>
  )
}
