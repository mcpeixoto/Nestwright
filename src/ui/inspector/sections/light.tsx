import { getEntry } from '../../../catalog/registry'
import { clampKelvin, clampLumens, kelvinToHex, lampOutput, LUMENS_MAX, LUMENS_MIN } from '../../../model/light'
import type { Item } from '../../../model/types'
import { selectActiveLevel, useStore } from '../../../store'
import { selectionFacts } from '../facts'
import { patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'
import { useTranslate } from '../../../i18n'

function LightSection() {
  const tr = useTranslate()
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const item = level?.items.find((entry) => entry.id === id)
  const entry = item ? getEntry(item.catalogId) : undefined
  if (!item || !entry?.light) return null
  const { lumens, kelvin } = lampOutput(item, entry.light)
  const on = item.lightOn !== false
  const set = (label: string, recipe: (found: Item) => void) => {
    patchLevel(label, (draft) => {
      const found = draft.items.find((entry) => entry.id === id)
      if (found) recipe(found)
    })
  }
  return (
    <div className="props">
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => set('Light', (found) => { found.lightOn = event.target.checked })}
        />
        <T k="Light on" />
      </label>
      <label className="field">
        <T k="Colour temperature" />
        <input
          type="range"
          min={2200}
          max={6500}
          step={50}
          value={kelvin}
          aria-label={tr('Colour temperature')}
          onChange={(event) => {
            const next = clampKelvin(Number(event.target.value))
            set('Light', (found) => {
              found.kelvin = next
              delete found.params.kelvin
            })
          }}
        />
        <span className="readout" style={{ color: kelvinToHex(kelvin) }}>
          {Math.round(kelvin)} K
        </span>
      </label>
      <label className="field">
        <T k="Light output" />
        <input
          type="range"
          min={LUMENS_MIN}
          max={LUMENS_MAX}
          step={10}
          value={lumens}
          aria-label={tr('Light output in lumens')}
          onChange={(event) => {
            const next = clampLumens(Number(event.target.value))
            set('Light', (found) => {
              found.lumens = next
              delete found.params.intensity
            })
          }}
        />
        <span className="readout">{Math.round(lumens)} lm</span>
      </label>
    </div>
  )
}

registerInspectorSection({
  id: 'light',
  order: 36,
  title: 'Light',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    const item = facts.items[0]
    if (facts.total !== 1 || !item) return false
    return Boolean(getEntry(item.catalogId)?.light)
  },
  Component: LightSection,
})
