import { useMemo, useSyncExternalStore } from 'react'
import type { Project } from '../model/types'
import { getPlanCursor, subscribePlanCursor } from '../plan2d/cursor'
import { polygonArea } from '../model/geometry'
import { levelAreas, projectAreas } from '../model/areas'
import { formatArea, formatLength } from '../model/units'
import { roomsFor, selectActiveLevel, useStore } from '../store'
import { useTranslate } from '../i18n'
import { levelDisplayName } from '../i18n/rooms'
import { useSettings } from '../settings'
import { setUnits } from '../settings/units'
import { clockTime, subscribeClock } from '../view3d/atmosphere/clock'
import { addLevelAbove } from './actions'
import { addLevelBelow, deleteActiveLevel, duplicateActiveLevel, importTraceImage } from './levelActions'
import { togglePanel, useOpenPanelIds } from './panels/registry'
import { DropMenu } from './topbar/DropMenu'
import { Tooltip } from './Tooltip'
import { formatHour } from './bottomBar/time'

/** Floors, view toggles, snapping, units, areas, cursor, notices and the daylight clock in one bar. */
export function BottomBar() {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const levels = useStore((s) => s.project.levels)
  const activeId = useStore((s) => s.activeLevelId)
  const display = useStore((s) => s.levelDisplay)
  const showRoofs = useStore((s) => s.showRoofs)
  const units = useStore((s) => s.project.units)
  const snapGrid = useStore((s) => s.snapGrid)
  const snapEnds = useStore((s) => s.snapEnds)
  const snapAngles = useStore((s) => s.snapAngles)
  const message = useStore((s) => s.message)
  const boundary = useStore((s) => s.project.terrain?.boundary)
  const time = useStore((s) => s.project.environment.time)
  const plotArea = formatArea(Math.abs(polygonArea(boundary ?? [])), units)
  const active = useStore(selectActiveLevel)
  const house = useMemo(() => projectAreas({ levels } as Project, roomsFor), [levels])
  const floor = useMemo(() => (active ? levelAreas(active, roomsFor(active)) : null), [active])
  const cursor = useSyncExternalStore(subscribePlanCursor, getPlanCursor, () => null)
  const hour = useSyncExternalStore(subscribeClock, () => clockTime(time), () => time)
  const daylightOpen = useOpenPanelIds().includes('environment')
  const store = () => useStore.getState()

  return (
    <footer className="bottombar">
      <div className="levelbar">
        <div className="levels">
          {levels.map((level) => (
            <button
              type="button"
              key={level.id}
              className={level.id === activeId ? 'level on' : 'level'}
              onClick={() => store().setActiveLevel(level.id)}
            >
              <input
                aria-label={tr('{name} name', { name: levelDisplayName(language, level.name) })}
                value={levelDisplayName(language, level.name)}
                onChange={(event) => {
                  const next = event.target.value
                  store().apply('Rename level', (draft) => {
                    const found = draft.levels.find((item) => item.id === level.id)
                    if (found) found.name = next
                  })
                }}
                onClick={(event) => event.stopPropagation()}
              />
              <span className="elev">{formatLength(level.elevation, units)}</span>
            </button>
          ))}
        </div>
        <DropMenu
          label="Add level"
          icon="plus"
          align="left"
          items={[
            { id: 'above', label: 'Add level above', run: addLevelAbove },
            { id: 'below', label: 'Add level below', run: addLevelBelow },
            { id: 'duplicate', label: 'Duplicate', run: duplicateActiveLevel },
            { id: 'delete', label: 'Delete level', run: deleteActiveLevel, disabled: levels.length <= 1 },
            { id: 'trace', label: 'Import trace image…', run: () => void importTraceImage() },
          ]}
        />
        <DropMenu
          label="Show"
          align="left"
          items={[
            { id: 'current', label: 'This level', run: () => store().setLevelDisplay('current'), checked: display === 'current' },
            {
              id: 'current-below',
              label: 'This and below',
              run: () => store().setLevelDisplay('current-below'),
              checked: display === 'current-below',
            },
            { id: 'all', label: 'All levels', run: () => store().setLevelDisplay('all'), checked: display === 'all' },
          ]}
        />
        <button
          type="button"
          className={showRoofs ? 'on' : ''}
          aria-pressed={showRoofs}
          onClick={() => store().setShowRoofs(!showRoofs)}
        >
          {tr('Roof')}
        </button>
      </div>
      <div className="statusbar">
        <span className="coords">
          {cursor ? `${formatLength(cursor.x, units)} , ${formatLength(cursor.y, units)}` : '—'}
        </span>
        <DropMenu
          label="Snap"
          align="left"
          items={[
            { id: 'grid', label: 'Grid', run: () => store().setSnap({ snapGrid: !snapGrid }), checked: snapGrid },
            { id: 'joints', label: 'Joints', run: () => store().setSnap({ snapEnds: !snapEnds }), checked: snapEnds },
            { id: 'angles', label: 'Angles', run: () => store().setSnap({ snapAngles: !snapAngles }), checked: snapAngles },
          ]}
        />
        <button type="button" onClick={() => setUnits(units === 'metric' ? 'imperial' : 'metric')}>
          {units === 'metric' ? tr('Metric') : tr('Imperial')}
        </button>
        {house.rooms > 0 ? (
          <Tooltip label={tr('Net floor area, inside the wall faces')}>
            <span className="status-area" tabIndex={0}>
              {tr('Floor {level} · House {house}', {
                level: formatArea(floor?.net ?? 0, units),
                house: formatArea(house.net, units),
              })}
              {house.outdoor > 0 ? ` · ${tr('Outdoor {area}', { area: formatArea(house.outdoor, units) })}` : ''}
            </span>
          </Tooltip>
        ) : null}
        <span>{plotArea}</span>
        <span className="status-msg">{message ? tr(message) : message}</span>
        <button
          type="button"
          className={daylightOpen ? 'chip on' : 'chip'}
          aria-label={tr('Daylight')}
          onClick={() => togglePanel('environment')}
        >
          ☀ {formatHour(hour)}
        </button>
      </div>
    </footer>
  )
}
