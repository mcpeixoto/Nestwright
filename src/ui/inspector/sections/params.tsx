import { getEntry } from '../../../catalog/registry'
import type { ParamDef } from '../../../catalog/types'
import { kitchenKind } from '../../../model/kitchen'
import { selectActiveLevel, useStore } from '../../../store'
import { selectionFacts } from '../facts'
import { NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'

function valueOf(params: Record<string, number | string | boolean>, def: ParamDef): number | string | boolean {
  const raw = params[def.key]
  return raw === undefined ? def.default : raw
}

function ParamsSection() {
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const item = level?.items.find((entry) => entry.id === id)
  const entry = item ? getEntry(item.catalogId) : undefined
  if (!item || !entry?.params || entry.params.length === 0 || kitchenKind(item.catalogId)) return null
  const defs = entry.params.filter((def) => def.key !== 'ready')
  if (defs.length === 0) return null
  const commit = (key: string, value: number | string | boolean) => {
    patchLevel('Item', (draft) => {
      const found = draft.items.find((entry) => entry.id === id)
      if (found) found.params[key] = value
    })
  }
  return (
    <div className="props">
      {defs.map((def) => {
        const value = valueOf(item.params, def)
        if (def.kind === 'boolean') {
          return (
            <label className="check" key={def.key}>
              <input type="checkbox" checked={Boolean(value)} onChange={(event) => commit(def.key, event.target.checked)} />
              {def.label}
            </label>
          )
        }
        if (def.kind === 'enum') {
          return (
            <label className="field" key={def.key}>
              {def.label}
              <select value={String(value)} onChange={(event) => commit(def.key, event.target.value)}>
                {(def.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        return (
          <NumberField
            key={def.key}
            label={def.label}
            value={typeof value === 'number' ? value : Number(def.default)}
            step={def.step ?? 0.05}
            onCommit={(next) => commit(def.key, next)}
          />
        )
      })}
    </div>
  )
}

registerInspectorSection({
  id: 'params',
  order: 40,
  title: 'Options',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    const item = facts.items[0]
    if (facts.total !== 1 || !item || kitchenKind(item.catalogId)) return false
    const entry = getEntry(item.catalogId)
    return Boolean(entry?.params && entry.params.length > 0)
  },
  Component: ParamsSection,
})
