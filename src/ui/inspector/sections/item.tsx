import { getEntry } from '../../../catalog/registry'
import { selectActiveLevel, useStore } from '../../../store'
import { deleteSelection } from '../../actions'
import { MaterialPicker } from '../../MaterialPicker'
import { selectionFacts } from '../facts'
import { labelOf, NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'

function ItemSection() {
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const currency = useStore((s) => s.project.budget.currency)
  const item = level?.items.find((entry) => entry.id === id)
  if (!item) return null
  const entry = getEntry(item.catalogId)
  const slots = entry ? Object.keys(entry.materialSlots) : Object.keys(item.materials)
  return (
    <div className="props">
      <h2>{entry?.name ?? item.catalogId}</h2>
      <NumberField
        label="Width"
        value={item.size.w}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Item size', (draft) => {
            const found = draft.items.find((entry) => entry.id === id)
            if (found && value > 0.05) found.size.w = value
          })
        }
      />
      <NumberField
        label="Depth"
        value={item.size.d}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Item size', (draft) => {
            const found = draft.items.find((entry) => entry.id === id)
            if (found && value > 0.05) found.size.d = value
          })
        }
      />
      <NumberField
        label="Height"
        value={item.size.h}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Item size', (draft) => {
            const found = draft.items.find((entry) => entry.id === id)
            if (found && value > 0.05) found.size.h = value
          })
        }
      />
      <NumberField
        label="Rotation °"
        value={(item.rotation * 180) / Math.PI}
        step={15}
        onCommit={(value) =>
          patchLevel('Rotate', (draft) => {
            const found = draft.items.find((entry) => entry.id === id)
            if (found) found.rotation = (value * Math.PI) / 180
          })
        }
      />
      <NumberField
        label="Elevation"
        value={item.elevation}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Item elevation', (draft) => {
            const found = draft.items.find((entry) => entry.id === id)
            if (found) found.elevation = value
          })
        }
      />
      {slots.map((slot) => (
        <label className="field" key={slot}>
          {labelOf(slot)}
          <MaterialPicker
            value={item.materials[slot] ?? entry?.materialSlots[slot] ?? { id: 'plaster-white' }}
            onChange={(next) =>
              patchLevel('Item material', (draft) => {
                const found = draft.items.find((entry) => entry.id === id)
                if (found) found.materials[slot] = next
              })
            }
          />
        </label>
      ))}
      <p className="readout">
        {currency} {(item.price ?? entry?.price ?? 0).toFixed(0)}
      </p>
      <button type="button" className="danger" onClick={deleteSelection}>
        Delete
      </button>
    </div>
  )
}

registerInspectorSection({
  id: 'item',
  order: 30,
  title: 'Item',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.items.length === 1
  },
  Component: ItemSection,
})
