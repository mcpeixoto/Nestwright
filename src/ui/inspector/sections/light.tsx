import { getEntry } from '../../../catalog/registry'
import { clampKelvin, kelvinToHex } from '../../../model/light'
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
  const kelvin = typeof item.params.kelvin === 'number' ? item.params.kelvin : 2700
  const intensity = typeof item.params.intensity === 'number' ? item.params.intensity : entry.light.intensity
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
              found.params.kelvin = next
            })
          }}
        />
        <span className="readout" style={{ color: kelvinToHex(kelvin) }}>
          {Math.round(kelvin)} K
        </span>
      </label>
      <label className="field">
        <T k="Intensity" />
        <input
          type="range"
          min={0}
          max={80}
          step={1}
          value={intensity}
          aria-label={tr('Light intensity')}
          onChange={(event) => {
            const next = Number(event.target.value)
            set('Light', (found) => {
              found.params.intensity = next
            })
          }}
        />
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
