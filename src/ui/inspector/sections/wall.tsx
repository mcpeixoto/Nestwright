import { selectActiveLevel, useStore } from '../../../store'
import { deleteSelection } from '../../actions'
import { MaterialPicker } from '../../MaterialPicker'
import { selectionFacts } from '../facts'
import { NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'

function WallSection() {
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const wall = level?.walls.find((item) => item.id === id)
  if (!wall) return null
  return (
    <div className="props">
      <h2>Wall</h2>
      <NumberField
        label="Thickness"
        value={wall.thickness}
        step={0.01}
        onCommit={(value) =>
          patchLevel('Wall thickness', (draft) => {
            const found = draft.walls.find((item) => item.id === id)
            if (found && value > 0.02) found.thickness = value
          })
        }
      />
      <NumberField
        label="Height"
        value={wall.height}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Wall height', (draft) => {
            const found = draft.walls.find((item) => item.id === id)
            if (found && value > 0.2) found.height = value
          })
        }
      />
      <label className="field">
        Left side
        <MaterialPicker
          value={wall.left}
          onChange={(next) =>
            patchLevel('Wall material', (draft) => {
              const found = draft.walls.find((item) => item.id === id)
              if (found) found.left = next
            })
          }
        />
      </label>
      <label className="field">
        Right side
        <MaterialPicker
          value={wall.right}
          onChange={(next) =>
            patchLevel('Wall material', (draft) => {
              const found = draft.walls.find((item) => item.id === id)
              if (found) found.right = next
            })
          }
        />
      </label>
      <button type="button" className="danger" onClick={deleteSelection}>
        Delete
      </button>
    </div>
  )
}

registerInspectorSection({
  id: 'wall',
  order: 30,
  title: 'Wall',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.walls.length === 1
  },
  Component: WallSection,
})
