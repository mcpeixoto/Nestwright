import { getEntry } from '../../../catalog/registry'
import { catalogName } from '../../../i18n/catalog'
import { useTranslate } from '../../../i18n'
import { formatMoney } from '../../../model/money'
import { useSettings } from '../../../settings'
import { selectActiveLevel, useStore } from '../../../store'
import { MaterialPicker } from '../../MaterialPicker'
import { selectionFacts } from '../facts'
import { labelOf, NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'

function ItemSection() {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const currency = useStore((s) => s.project.budget.currency)
  const item = level?.items.find((entry) => entry.id === id)
  if (!item) return null
  const entry = getEntry(item.catalogId)
  const catalogPrice = entry?.price ?? 0
  const money = (amount: number) => formatMoney(amount, currency, language)
  const slots = entry ? Object.keys(entry.materialSlots) : Object.keys(item.materials)
  return (
    <div className="props">
      <h2>{entry ? catalogName(language, entry.id, entry.name) : item.catalogId}</h2>
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
          {tr(labelOf(slot))}
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
        {tr('Catalog price')}: {money(catalogPrice)}
      </p>
      <label className="field">
        {tr('Quoted price')}
        <input
          type="number"
          min={0}
          step={1}
          aria-label={tr('Quoted price')}
          value={item.price ?? ''}
          placeholder={String(catalogPrice)}
          onChange={(event) => {
            const raw = event.target.value
            patchLevel('Item price', (draft) => {
              const found = draft.items.find((entry) => entry.id === id)
              if (!found) return
              if (raw.trim() === '') {
                delete found.price
                return
              }
              const next = Number(raw)
              if (Number.isFinite(next) && next >= 0) found.price = next
            })
          }}
        />
      </label>
      {typeof item.price === 'number' && (
        <>
          <p className="readout">{tr('Quoted: {amount}', { amount: money(item.price) })}</p>
          <button
            type="button"
            onClick={() =>
              patchLevel('Reset price', (draft) => {
                const found = draft.items.find((entry) => entry.id === id)
                if (found) delete found.price
              })
            }
          >
            {tr('Reset')}
          </button>
        </>
      )}
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
