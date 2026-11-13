import { useTranslate } from '../i18n'
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
  const apartment = useStore((s) => s.project.kind === 'apartment')
  const tr = useTranslate()
  const tools = listTools().filter((item) => {
    if (item.id === 'place-item') return false
    if (apartment && item.group === 'outside') return false
    if (!apartment && item.id === 'balcony') return false
    return true
  })
  const panels = usePanelList().filter(
    (panel) => (panel.placement === 'left' || panel.placement === 'right') && !(apartment && panel.id === 'outside'),
  )
  const open = useOpenPanelIds()

  return (
    <aside className="rail">
      {GROUPS.map((group) => {
        const items = tools.filter((item) => item.group === group.id)
        if (items.length === 0) return null
        return (
          <div key={group.id} className="rail-group" aria-label={tr(group.label)}>
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={tool === item.id ? 'tool on' : 'tool'}
                title={item.shortcut ? `${tr(item.label)} (${item.shortcut})` : tr(item.label)}
                onClick={() => useStore.getState().setTool(item.id)}
                dangerouslySetInnerHTML={{ __html: item.icon }}
              />
            ))}
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
