import { useState } from 'react'
import { newId } from '../../model/ids'
import {
  BEFORE_SWITCH_NAME,
  diffVariants,
  duplicateVariant,
  planSwitch,
  summariseDiff,
  variantFrom,
} from '../../model/variants'
import { useStore } from '../../store'
import { registerPanel } from './registry'
import { setCompareVariant, useCompareVariant } from '../together/compare'

export function VariantsPanel() {
  const project = useStore((s) => s.project)
  const compareId = useCompareVariant()
  const [name, setName] = useState('')
  const variants = project.variants ?? []
  const compared = variants.find((item) => item.id === compareId) ?? null
  let summary = ''
  if (compared) {
    try {
      summary = summariseDiff(diffVariants(variantFrom(project, 'Current', 'current', 0), compared, project.budget))
    } catch {
      summary = ''
    }
  }

  return (
    <div className="props together-panel">
      <h2>Variants</h2>
      <label className="field">
        Name
        <input value={name} placeholder="Option A" onChange={(event) => setName(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          const label = name.trim() || `Option ${variants.length + 1}`
          const snap = variantFrom(useStore.getState().project, label, newId('variant'), Date.now())
          useStore.getState().apply('Save variant', (draft) => {
            draft.variants.push(snap)
          })
          setName('')
        }}
      >
        Save current
      </button>
      {variants.length === 0 && <p className="hint">Save the design to keep an option you can switch back to.</p>}
      {variants.map((variant) => (
        <section key={variant.id} className="wish-row">
          <label className="field" style={{ flex: 1 }}>
            <input
              aria-label={`Name of ${variant.name}`}
              defaultValue={variant.name}
              onBlur={(event) => {
                const next = event.target.value.trim()
                if (!next || next === variant.name) return
                useStore.getState().apply('Rename variant', (draft) => {
                  const found = draft.variants.find((item) => item.id === variant.id)
                  if (found) found.name = next
                })
              }}
            />
          </label>
          <div className="wish-actions">
            <button
              type="button"
              onClick={() => {
                const plan = planSwitch(useStore.getState().project, variant.id, newId('variant'), Date.now())
                if (!plan) return
                useStore.getState().apply('Switch variant', (draft) => {
                  draft.levels = plan.levels
                  draft.terrain = plan.terrain
                  draft.variants.push(plan.before)
                })
              }}
            >
              Switch
            </button>
            <button
              type="button"
              className={compareId === variant.id ? 'on' : ''}
              onClick={() => {
                if (compareId === variant.id) {
                  setCompareVariant(null)
                  return
                }
                const view = useStore.getState().view
                if (view === 'walk' || view === '2d') useStore.getState().setView('3d')
                setCompareVariant(variant.id)
              }}
            >
              Compare
            </button>
            <button
              type="button"
              onClick={() => {
                const added = duplicateVariant(useStore.getState().project.variants, variant.id, newId('variant'), Date.now()).at(-1)
                if (!added || added.id === variant.id) return
                useStore.getState().apply('Duplicate variant', (draft) => {
                  draft.variants.push(added)
                })
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                if (compareId === variant.id) setCompareVariant(null)
                useStore.getState().apply('Delete variant', (draft) => {
                  const index = draft.variants.findIndex((item) => item.id === variant.id)
                  if (index >= 0) draft.variants.splice(index, 1)
                })
              }}
            >
              Delete
            </button>
          </div>
        </section>
      ))}
      {compared && (
        <p className="hint">
          Current against {compared.name}. Switching files the live design as “{BEFORE_SWITCH_NAME}”. {summary}
        </p>
      )}
    </div>
  )
}

registerPanel({
  id: 'variants',
  title: 'Variants',
  placement: 'floating',
  Component: VariantsPanel,
})
