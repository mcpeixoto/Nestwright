import { elevationForFloor, floorNumber } from '../../../apartment/floor'
import { selectActiveLevel, useStore } from '../../../store'
import { T } from '../../../i18n/T'
import { selectionFacts } from '../facts'
import { NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'

function FloorNumberSection() {
  const level = useStore(selectActiveLevel)
  if (!level) return null
  return (
    <div className="props">
      <NumberField
        label="Floor number"
        value={floorNumber(level.elevation)}
        step={1}
        onCommit={(value) =>
          patchLevel('Floor number', (draft) => {
            draft.elevation = elevationForFloor(value)
          })
        }
      />
      <p className="hint">
        <T k="The view from the windows sits at this storey." />
      </p>
    </div>
  )
}

registerInspectorSection({
  id: 'floor-number',
  order: 12,
  title: 'Floor number',
  match: (selection, state) => state.project.kind === 'apartment' && selectionFacts(selection, state).total === 0,
  Component: FloorNumberSection,
})
