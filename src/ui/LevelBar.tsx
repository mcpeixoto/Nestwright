import { useStore } from '../store'
import { addLevelAbove } from './actions'
import { addLevelBelow, deleteActiveLevel, duplicateActiveLevel, importTraceImage } from './levelActions'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'
import { levelDisplayName } from '../i18n/rooms'
import { useSettings } from '../settings'

export function LevelBar() {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const levels = useStore((s) => s.project.levels)
  const activeId = useStore((s) => s.activeLevelId)
  const display = useStore((s) => s.levelDisplay)
  const showRoofs = useStore((s) => s.showRoofs)
  const last = levels.length <= 1

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
              aria-label={tr('{name} name', { name: levelDisplayName(language, level.name) })}
              value={levelDisplayName(language, level.name)}
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
        <T k="Add level above" />
      </button>
      <button type="button" onClick={addLevelBelow}>
        <T k="Add level below" />
      </button>
      <button type="button" onClick={duplicateActiveLevel}>
        <T k="Duplicate" />
      </button>
      <button type="button" onClick={deleteActiveLevel} disabled={last}>
        <T k="Delete level" />
      </button>
      <button type="button" onClick={() => void importTraceImage()}>
        <T k="Import trace image…" />
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={showRoofs}
          onChange={(event) => useStore.getState().setShowRoofs(event.target.checked)}
        />
        <T k="Roof" />
      </label>
      <label className="display-mode">
        <T k="Show" />
        <select value={display} onChange={(event) => useStore.getState().setLevelDisplay(event.target.value as typeof display)}>
          <option value="current">{tr('This level')}</option>
          <option value="current-below">{tr('This and below')}</option>
          <option value="all">{tr('All levels')}</option>
        </select>
      </label>
    </footer>
  )
}
