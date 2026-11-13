import { formatArea } from '../../../model/units'
import type { MaterialRef, RoomType } from '../../../model/types'
import { roomsFor, selectActiveLevel, useStore } from '../../../store'
import { MaterialPicker } from '../../MaterialPicker'
import { selectionFacts } from '../facts'
import { labelOf, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'
import { useTranslate } from '../../../i18n'

const ROOM_TYPES: RoomType[] = [
  'living',
  'kitchen',
  'dining',
  'bedroom',
  'bathroom',
  'wc',
  'office',
  'hall',
  'storage',
  'laundry',
  'garage',
  'balcony',
  'terrace',
  'kids',
  'other',
]

function RoomSection() {
  const tr = useTranslate()
  const roomKey = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const units = useStore((s) => s.project.units)
  const room = level ? roomsFor(level).find((item) => item.key === roomKey) : undefined
  if (!room || !level) return null
  const edit = (label: string, recipe: (props: { name: string; type: RoomType; floor: MaterialRef }) => void) => {
    patchLevel(label, (draft) => {
      let props = draft.rooms.find((item) => item.key === roomKey)
      if (!props) {
        props = { key: roomKey, name: room.name, type: room.type, floor: { ...room.floor }, ceiling: { ...room.ceiling } }
        draft.rooms.push(props)
      }
      recipe(props)
    })
  }
  return (
    <div className="props">
      <h2><T k="Room" /></h2>
      <label className="field">
        <T k="Name" />
        <input
          value={room.name}
          onChange={(event) => {
            const next = event.target.value
            edit('Room name', (props) => {
              props.name = next
            })
          }}
        />
      </label>
      <label className="field">
        <T k="Type" />
        <select
          value={room.type}
          onChange={(event) => {
            const next = event.target.value as RoomType
            edit('Room type', (props) => {
              props.type = next
            })
          }}
        >
          {ROOM_TYPES.map((type) => (
            <option key={type} value={type}>
              {tr(labelOf(type))}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <T k="Floor" />
        <MaterialPicker
          value={room.floor}
          onChange={(next) =>
            edit('Room floor', (props) => {
              props.floor = next
            })
          }
        />
      </label>
      <p className="readout">{tr('Area {area}', { area: formatArea(room.area, units) })}</p>
    </div>
  )
}

registerInspectorSection({
  id: 'room',
  order: 30,
  title: 'Room',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.room != null
  },
  Component: RoomSection,
})
