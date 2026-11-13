import { useStore } from '../store'
import { listTools } from '../tools/registry'
import { togglePanel, useOpenPanelIds, usePanelList } from './panels/registry'

const GROUPS = [
  { id: 'build', label: 'Build' },
  { id: 'openings', label: 'Openings' },
  { id: 'interior', label: 'Interior' },
  { id: 'outside', label: 'Outside' },
  { id: 'measure', label: 'Measure' },
] as const

export function ToolRail() {
  const tool = useStore((s) => s.tool)
  const tools = listTools().filter((item) => item.id !== 'place-item')
  const panels = usePanelList().filter((panel) => panel.placement === 'left' || panel.placement === 'right')
  const open = useOpenPanelIds()

  return (
    <aside className="rail">
      {GROUPS.map((group) => (
        <div key={group.id} className="rail-group" aria-label={group.label}>
          {tools
            .filter((item) => item.group === group.id)
            .map((item) => (
              <button
                type="button"
                key={item.id}
                className={tool === item.id ? 'tool on' : 'tool'}
                title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                onClick={() => useStore.getState().setTool(item.id)}
                dangerouslySetInnerHTML={{ __html: item.icon }}
              />
            ))}
        </div>
      ))}
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
