import { openingSize } from '../../../model/defaults'
import type { OpeningType } from '../../../model/types'
import { selectActiveLevel, useStore } from '../../../store'
import { DOOR_TYPES, WINDOW_TYPES } from '../../../tools/openingTool'
import { deleteSelection } from '../../actions'
import { selectionFacts } from '../facts'
import { labelOf, NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'

function OpeningSection() {
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const opening = level?.openings.find((item) => item.id === id)
  if (!opening) return null
  const types: OpeningType[] = [...DOOR_TYPES, ...WINDOW_TYPES]
  return (
    <div className="props">
      <h2>{labelOf(opening.type)}</h2>
      <label className="field">
        Type
        <select
          value={opening.type}
          onChange={(event) => {
            const type = event.target.value as OpeningType
            const size = openingSize(type)
            patchLevel('Opening type', (draft) => {
              const found = draft.openings.find((item) => item.id === id)
              if (!found) return
              found.type = type
              found.width = size.width
              found.height = size.height
              found.sill = size.sill
            })
          }}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {labelOf(type)}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Width"
        value={opening.width}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Opening width', (draft) => {
            const found = draft.openings.find((item) => item.id === id)
            if (found && value > 0.2) found.width = value
          })
        }
      />
      <NumberField
        label="Height"
        value={opening.height}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Opening height', (draft) => {
            const found = draft.openings.find((item) => item.id === id)
            if (found && value > 0.2) found.height = value
          })
        }
      />
      <NumberField
        label="Sill"
        value={opening.sill}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Opening sill', (draft) => {
            const found = draft.openings.find((item) => item.id === id)
            if (found && value >= 0) found.sill = value
          })
        }
      />
      <label className="check">
        <input
          type="checkbox"
          checked={opening.flipHinge === true}
          onChange={(event) => {
            const checked = event.target.checked
            patchLevel('Opening hinge', (draft) => {
              const found = draft.openings.find((item) => item.id === id)
              if (found) found.flipHinge = checked
            })
          }}
        />
        Flip hinge
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={opening.flipSide === true}
          onChange={(event) => {
            const checked = event.target.checked
            patchLevel('Opening swing', (draft) => {
              const found = draft.openings.find((item) => item.id === id)
              if (found) found.flipSide = checked
            })
          }}
        />
        Flip swing
      </label>
      <button type="button" className="danger" onClick={deleteSelection}>
        Delete
      </button>
    </div>
  )
}

registerInspectorSection({
  id: 'opening',
  order: 30,
  title: 'Opening',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.openings.length === 1
  },
  Component: OpeningSection,
})
