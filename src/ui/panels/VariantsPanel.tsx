import { useState } from 'react'
import { newId } from '../../model/ids'
import {
  BEFORE_SWITCH_NAME,
  diffVariants,
  duplicateVariant,
  optionLabel,
  planSwitch,
  variantFrom,
} from '../../model/variants'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { useSettings } from '../../settings'
import { describeDiff } from '../variantSummary'
import { useStore } from '../../store'
import { registerPanel } from './registry'
import { setCompareVariant, useCompareVariant } from '../together/compare'

export function VariantsPanel() {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const project = useStore((s) => s.project)
  const compareId = useCompareVariant()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const variants = project.variants ?? []
  const compared = variants.find((item) => item.id === compareId) ?? null
  let summary = ''
  if (compared) {
    try {
      summary = describeDiff(language, diffVariants(variantFrom(project, 'Current', 'current', 0), compared, project.budget))
    } catch {
      summary = ''
    }
  }

  return (
    <div className="props together-panel">
      <label className="field">
        <T k="Name" />
        <input value={name} aria-label={tr('Name')} placeholder={tr(optionLabel(0))} onChange={(event) => setName(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          const label = name.trim() || optionLabel(variants.length)
          const snap = variantFrom(useStore.getState().project, label, newId('variant'), Date.now())
          useStore.getState().apply('Save variant', (draft) => {
            draft.variants.push(snap)
          })
          setName('')
        }}
      >
        <T k="Save current" />
      </button>
      {variants.length === 0 && (
        <p className="hint">
          <T k="Save the design to keep an option you can switch back to." />
        </p>
      )}
      {variants.map((variant) => (
        <section key={variant.id} className="wish-row">
          <div className="rename-wide">
            {editing === variant.id ? (
              <input
                aria-label={tr('Name')}
                defaultValue={variant.name}
                autoFocus
                onBlur={(event) => {
                  setEditing(null)
                  const next = event.target.value.trim()
                  if (!next || next === variant.name) return
                  useStore.getState().apply('Rename variant', (draft) => {
                    const found = draft.variants.find((item) => item.id === variant.id)
                    if (found) found.name = next
                  })
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
            ) : (
              <button type="button" className="rename-label" onDoubleClick={() => setEditing(variant.id)}>
                {tr(variant.name)}
              </button>
            )}
          </div>
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
              <T k="Switch" />
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
              <T k="Compare" />
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
              <T k="Duplicate" />
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
              <T k="Delete" />
            </button>
          </div>
        </section>
      ))}
      {compared && (
        <p className="hint">
          {tr('Current against {name}. Switching files the live design as “{before}”. {summary}', {
            name: compared.name,
            before: tr(BEFORE_SWITCH_NAME),
            summary,
          })}
        </p>
      )}
    </div>
  )
}

registerPanel({
  id: 'variants',
  title: 'Options A/B',
  placement: 'floating',
  Component: VariantsPanel,
})
