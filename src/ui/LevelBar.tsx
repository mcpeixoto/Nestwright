import { useStore } from '../store'
import { addLevelAbove } from './actions'

export function LevelBar() {
  const levels = useStore((s) => s.project.levels)
  const activeId = useStore((s) => s.activeLevelId)
  const display = useStore((s) => s.levelDisplay)

  return (
    <footer className="levelbar">
      <div className="levels">
        {levels.map((level) => (
          <button
            type="button"
            key={level.id}
            className={level.id === activeId ? 'level on' : 'level'}
            onClick={() => useStore.getState().setActiveLevel(level.id)}
          >
            <input
              aria-label={`${level.name} name`}
              value={level.name}
              onChange={(event) => {
                const next = event.target.value
                useStore.getState().apply('Rename level', (draft) => {
                  const found = draft.levels.find((item) => item.id === level.id)
                  if (found) found.name = next
                })
              }}
              onClick={(event) => event.stopPropagation()}
            />
            <span className="elev">{level.elevation.toFixed(1)} m</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={addLevelAbove}>
        Add level above
      </button>
      <label className="display-mode">
        Show
        <select value={display} onChange={(event) => useStore.getState().setLevelDisplay(event.target.value as typeof display)}>
          <option value="current">This level</option>
          <option value="current-below">This and below</option>
          <option value="all">All levels</option>
        </select>
      </label>
    </footer>
  )
}
