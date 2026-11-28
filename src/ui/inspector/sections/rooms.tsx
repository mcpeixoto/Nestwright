import { useMemo } from 'react'
import { roomNetArea } from '../../../model/areas'
import { estimateBudget } from '../../../model/budget'
import { pointInPolygon } from '../../../model/geometry'
import { formatMoney } from '../../../model/money'
import { formatArea } from '../../../model/units'
import { useTranslate } from '../../../i18n'
import { roomDisplayName } from '../../../i18n/rooms'
import { useSettings } from '../../../settings'
import { roomsFor, selectActiveLevel, useStore } from '../../../store'
import { registerInspectorSection } from '../registry'

function RoomsSection() {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const project = useStore((s) => s.project)
  const level = useStore(selectActiveLevel)
  const estimate = useMemo(() => estimateBudget(project), [project])
  if (!level) return null
  const rooms = roomsFor(level)
  return (
    <div className="card-body">
      <ul className="room-list">
        {rooms.map((room) => {
          const n = level.items.filter((item) => pointInPolygon(item.position, room.polygon)).length
          const total = estimate.byRoom.find((entry) => entry.key === room.key)?.total ?? 0
          return (
            <li key={room.key}>
              <button type="button" onClick={() => useStore.getState().select([room.key])}>
                <span>{roomDisplayName(language, room.name)}</span>
                <span>{formatArea(roomNetArea(level, room), project.units)}</span>
                <span className="hint">{tr('{n} items', { n })}</span>
                <span>{formatMoney(total, estimate.currency, language)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

registerInspectorSection({
  id: 'rooms',
  order: 11,
  title: 'Rooms',
  match: (selection, state) => {
    if (selection.length !== 0) return false
    const level = state.project.levels.find((item) => item.id === state.activeLevelId)
    return !!level && roomsFor(level).length > 0
  },
  Component: RoomsSection,
})
