import { useMemo, useSyncExternalStore } from 'react'
import type { Project } from '../model/types'
import { getPlanCursor, subscribePlanCursor } from '../plan2d/cursor'
import { polygonArea } from '../model/geometry'
import { levelAreas, projectAreas } from '../model/areas'
import { formatArea, formatLength } from '../model/units'
import { roomsFor, selectActiveLevel, useStore } from '../store'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'
import { setUnits } from '../settings/units'
import { Tooltip } from './Tooltip'

export function StatusBar() {
  const tr = useTranslate()
  const units = useStore((s) => s.project.units)
  const snapGrid = useStore((s) => s.snapGrid)
  const snapEnds = useStore((s) => s.snapEnds)
  const snapAngles = useStore((s) => s.snapAngles)
  const message = useStore((s) => s.message)
  const boundary = useStore((s) => s.project.terrain?.boundary)
  const plotArea = formatArea(Math.abs(polygonArea(boundary ?? [])), units)
  const levels = useStore((s) => s.project.levels)
  const active = useStore(selectActiveLevel)
  const house = useMemo(() => projectAreas({ levels } as Project, roomsFor), [levels])
  const floor = useMemo(() => (active ? levelAreas(active, roomsFor(active)) : null), [active])
  const cursor = useSyncExternalStore(subscribePlanCursor, getPlanCursor, () => null)

  return (
    <footer className="statusbar">
      <span className="coords">
        {cursor ? `${formatLength(cursor.x, units)} , ${formatLength(cursor.y, units)}` : '—'}
      </span>
      <button type="button" className={snapGrid ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapGrid: !snapGrid })}>
        <T k="Grid" />
      </button>
      <button type="button" className={snapEnds ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapEnds: !snapEnds })}>
        <T k="Joints" />
      </button>
      <button type="button" className={snapAngles ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapAngles: !snapAngles })}>
        <T k="Angles" />
      </button>
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
    </footer>
  )
}
