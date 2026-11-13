import { useStore } from '../store'
import { noteReturnView } from '../view3d/rigs/walk'
import { useOpenPanelIds, usePanelList, togglePanel } from './panels/registry'
import { listTopBarActions } from './topbar/registry'
import './topbar/builtins'

const VIEWS = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
  { id: 'split', label: 'Split' },
  { id: 'walk', label: 'Walk' },
] as const

export function TopBar() {
  const name = useStore((s) => s.project.name)
  const view = useStore((s) => s.view)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const panels = usePanelList().filter((panel) => panel.placement === 'bottom' || panel.placement === 'floating')
  const open = useOpenPanelIds()

  return (
    <header className="topbar">
      <div className="wordmark">Nestwright</div>
      <input
        className="project-name"
        aria-label="Project name"
        value={name}
        onChange={(event) => {
          const next = event.target.value
          useStore.getState().apply('Rename', (draft) => {
            draft.name = next
          })
        }}
      />
      <div className="view-switch" role="group" aria-label="View">
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
            {item.label}
          </button>
        ))}
      </div>
      <div className="top-actions">
        <button type="button" disabled={!canUndo} onClick={() => useStore.getState().undo()}>
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => useStore.getState().redo()}>
          Redo
        </button>
        {listTopBarActions().map((action) =>
          action.Component ? (
            <action.Component key={action.id} />
          ) : (
            <button type="button" key={action.id} onClick={() => action.run?.()}>
              {action.label}
            </button>
          ),
        )}
        {panels.map((panel) =>
          panel.icon ? (
            <button
              type="button"
              key={panel.id}
              className={open.includes(panel.id) ? 'icon-btn on' : 'icon-btn'}
              aria-label={panel.title}
              title={panel.title}
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
              {panel.title}
            </button>
          ),
        )}
      </div>
    </header>
  )
}
