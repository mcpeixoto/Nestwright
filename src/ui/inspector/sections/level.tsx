import { selectActiveLevel, useStore } from '../../../store'
import { selectionFacts } from '../facts'
import { NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'

function LevelSection() {
  const level = useStore(selectActiveLevel)
  if (!level) return null
  return (
    <div className="props">
      <h2>Level</h2>
      <label className="field">
        Name
        <input
          value={level.name}
          onChange={(event) => {
            const next = event.target.value
            patchLevel('Rename level', (draft) => {
              draft.name = next
            })
          }}
        />
      </label>
      <NumberField
        label="Height"
        value={level.height}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Level height', (draft) => {
            if (value > 0.2) draft.height = value
          })
        }
      />
      <NumberField
        label="Elevation"
        value={level.elevation}
        step={0.1}
        onCommit={(value) =>
          patchLevel('Level elevation', (draft) => {
            draft.elevation = value
          })
        }
      />
      <NumberField
        label="Slab"
        value={level.slabThickness}
        step={0.01}
        onCommit={(value) =>
          patchLevel('Slab thickness', (draft) => {
            if (value > 0) draft.slabThickness = value
          })
        }
      />
      <p className="hint">Select a wall, opening, room or piece of furniture.</p>
    </div>
  )
}

registerInspectorSection({
  id: 'level',
  order: 10,
  title: 'Level',
  match: (selection, state) => selectionFacts(selection, state).total === 0,
  Component: LevelSection,
})
