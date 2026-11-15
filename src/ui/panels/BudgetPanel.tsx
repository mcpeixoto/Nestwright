import { useState } from 'react'
import { getEntry } from '../../catalog/registry'
import { catalogName } from '../../i18n/catalog'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { bytesToDataUrl } from '../../io/export/binary'
import { budgetCsv, CSV_BOM } from '../../io/export/budgetCsv'
import { budgetLineText } from '../../io/export/budgetLabels'
import { budgetPdf } from '../../io/export/budgetPdf'
import {
  BUDGET_CATEGORIES,
  budgetCategoryKey,
  estimateBudget,
  variantBudgets,
  type BudgetCategory,
  type BudgetLine,
} from '../../model/budget'
import { newId } from '../../model/ids'
import { formatMoney } from '../../model/money'
import type { BudgetExtra } from '../../model/types'
import { getPlatform } from '../../platform'
import { useSettings } from '../../settings'
import { useStore } from '../../store'
import { roomDisplayName } from '../../i18n/rooms'
import { icon } from '../../tools/icons'
import { registerPanel, setPanelOpen } from './registry'

const CAT_COLOR: Record<BudgetCategory, string> = {
  construction: '#e8b86d',
  finishes: '#3fb8af',
  openings: '#8eaae6',
  items: '#d4655a',
  terrain: '#8aaa72',
  labour: '#c48a6a',
  fees: '#c9a227',
  other: '#9aa0a6',
}

function fileStem(name: string): string {
  return name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || 'project'
}

function signedMoney(amount: number, money: (value: number) => string): string {
  if (amount === 0) return money(0)
  return `${amount > 0 ? '+' : '−'}${money(Math.abs(amount))}`
}

export function BudgetPanel() {
  const tr = useTranslate()
  const locale = useSettings((s) => s.language)
  const project = useStore((s) => s.project)
  const budget = project.budget ?? { currency: 'EUR', buildCostPerM2: 1600, finishCostPerM2: {} }
  let estimate = estimateBudget(project)
  if (!Number.isFinite(estimate.total)) {
    estimate = { ...estimate, total: 0, delta: null }
  }
  const compared = variantBudgets(project)
  const max = Math.max(...BUDGET_CATEGORIES.map((id) => estimate.byCategory[id]), 0)
  const money = (amount: number) => formatMoney(amount, estimate.currency, locale)
  const [extraLabel, setExtraLabel] = useState('')
  const [extraAmount, setExtraAmount] = useState('')
  const [extraKind, setExtraKind] = useState<BudgetExtra['kind']>('labour')
  const placed = (project.levels ?? []).flatMap((level) => level.items ?? [])
  const quoteLines = estimate.lines.filter((line) => !line.id.startsWith('extra:'))

  function lineText(line: BudgetLine): string {
    return budgetLineText(line, locale)
  }


  async function exportCsv() {
    const current = useStore.getState().project
    const csv = budgetCsv(estimateBudget(current), current, locale)
    const name = `${fileStem(current.name)}-budget.csv`
    const ok = await getPlatform().saveFile(name, bytesToDataUrl(new TextEncoder().encode(CSV_BOM + csv), 'text/csv'))
    useStore.getState().setMessage(tr(ok ? 'Exported CSV' : 'Export cancelled'))
  }

  async function exportPdf() {
    const current = useStore.getState().project
    const bytes = budgetPdf(current, locale)
    const name = `${fileStem(current.name)}-budget.pdf`
    const ok = await getPlatform().saveFile(name, bytesToDataUrl(bytes, 'application/pdf'))
    useStore.getState().setMessage(tr(ok ? 'Exported PDF' : 'Export cancelled'))
  }

  return (
    <div className="props together-panel budget-panel">
      <div className="panel-head">
        <h2>
          <T k="Budget" />
        </h2>
        <button type="button" className="icon-btn" aria-label={tr('Close')} onClick={() => setPanelOpen('budget', false)}>
          ×
        </button>
      </div>
      <p className="budget-total">{money(estimate.total)}</p>
      {estimate.delta != null && (
        <p className={estimate.delta >= 0 ? 'under' : 'over'}>
          {estimate.delta >= 0
            ? tr('Under by {amount}', { amount: money(estimate.delta) })
            : tr('Over by {amount}', { amount: money(-estimate.delta) })}
        </p>
      )}
      <svg viewBox={`0 0 100 ${BUDGET_CATEGORIES.length * 10}`} width="100%" role="img" aria-label={tr('Budget by category')}>
        {BUDGET_CATEGORIES.map((id, index) => {
          const amount = estimate.byCategory[id]
          const width = max > 0 ? (amount / max) * 100 : 0
          return (
            <g key={id}>
              <rect x={0} y={index * 10} width={100} height={7} rx={2} fill="rgba(255,255,255,0.06)" />
              <rect x={0} y={index * 10} width={Math.max(0, width)} height={7} rx={2} fill={CAT_COLOR[id]} />
            </g>
          )
        })}
      </svg>
      {BUDGET_CATEGORIES.map((id) => (
        <div className="bar-label" key={id}>
          <span>{tr(budgetCategoryKey(id))}</span>
          <span />
          <span>{money(estimate.byCategory[id])}</span>
        </div>
      ))}
      <label className="field">
        <T k="Build cost per m²" />
        <input
          type="number"
          min={0}
          step={10}
          value={budget.buildCostPerM2}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (!Number.isFinite(next) || next < 0) return
            useStore.getState().apply('Build cost', (draft) => {
              draft.budget.buildCostPerM2 = next
            })
          }}
        />
      </label>
      <label className="field">
        <T k="Currency" />
        <input
          value={budget.currency}
          maxLength={8}
          onChange={(event) => {
            const next = event.target.value.toUpperCase().slice(0, 8)
            useStore.getState().apply('Currency', (draft) => {
              draft.budget.currency = next || 'EUR'
            })
          }}
        />
      </label>
      <label className="field">
        <T k="Budget target" />
        <input
          type="number"
          min={0}
          step={100}
          value={budget.target ?? ''}
          placeholder={tr('No target')}
          aria-label={tr('Budget target')}
          onChange={(event) => {
            const raw = event.target.value
            useStore.getState().apply('Budget target', (draft) => {
              if (raw.trim() === '') {
                delete draft.budget.target
                return
              }
              const next = Number(raw)
              if (Number.isFinite(next) && next >= 0) draft.budget.target = next
            })
          }}
        />
      </label>
      <table className="budget-table">
        <tbody>
          {estimate.byRoom.length === 0 && (
            <tr>
              <td>
                <T k="No rooms yet" />
              </td>
              <td>{money(0)}</td>
            </tr>
          )}
          {estimate.byRoom.map((room) => (
            <tr key={room.key || 'outside'}>
              <td>{roomDisplayName(locale, room.name)}</td>
              <td>{money(room.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {quoteLines.length > 0 && (
        <>
          <h3 className="budget-section-title">
            <T k="Lines" />
          </h3>
          <ul className="budget-lines">
            {quoteLines.map((line) => {
              const quote = budget.overrides?.[line.id]
              return (
                <li key={line.id}>
                  <span>
                    {tr(budgetCategoryKey(line.category))} · {line.roomName && line.roomName !== 'Outside' ? line.roomName : tr('Outside')} · {lineText(line)}
                  </span>
                  <span>{money(line.amount)}</span>
                  {typeof quote === 'number' && <span>{tr('Quoted: {amount}', { amount: money(quote) })}</span>}
                  <label className="budget-quote">
                    {tr('Quoted price')}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={tr('Quoted price')}
                      value={quote ?? ''}
                      onChange={(event) => setLineQuote(line.id, event.target.value)}
                    />
                  </label>
                  {typeof quote === 'number' && (
                    <button type="button" aria-label={tr('Clear quote')} onClick={() => setLineQuote(line.id, '')}>
                      <T k="Reset" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {placed.length > 0 && (
        <>
          <h3 className="budget-section-title">
            <T k="Placed items" />
          </h3>
          <ul className="budget-items">
            {placed.map((item) => {
              const entry = getEntry(item.catalogId)
              const catalogPrice = entry?.price ?? 0
              const name = entry ? catalogName(locale, entry.id, entry.name) : item.catalogId
              return (
                <li key={item.id}>
                  <span>{name}</span>
                  <span>
                    {tr('Catalog price')}: {money(catalogPrice)}
                  </span>
                  {typeof item.price === 'number' && <span>{tr('Quoted: {amount}', { amount: money(item.price) })}</span>}
                  <label className="field">
                    {tr('Quoted price')}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`${tr('Quoted price')} ${name}`}
                      value={item.price ?? ''}
                      placeholder={String(catalogPrice)}
                      onChange={(event) => setItemPrice(item.id, event.target.value)}
                    />
                  </label>
                  {typeof item.price === 'number' && (
                    <button type="button" onClick={() => setItemPrice(item.id, '')}>
                      <T k="Reset" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <h3 className="budget-section-title">
        <T k="Extra lines" />
      </h3>
      <div className="budget-extra-form">
        <label className="field">
          <T k="Label" />
          <input aria-label={tr('Label')} value={extraLabel} onChange={(event) => setExtraLabel(event.target.value)} />
        </label>
        <label className="field">
          <T k="Amount" />
          <input
            type="number"
            min={0}
            step={1}
            aria-label={tr('Amount')}
            value={extraAmount}
            onChange={(event) => setExtraAmount(event.target.value)}
          />
        </label>
        <label className="field">
          <T k="Kind" />
          <select aria-label={tr('Kind')} value={extraKind} onChange={(event) => setExtraKind(event.target.value as BudgetExtra['kind'])}>
            <option value="labour">{tr('Labour')}</option>
            <option value="fees">{tr('Fees')}</option>
            <option value="other">{tr('Other')}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            const amount = Number(extraAmount)
            if (!Number.isFinite(amount) || amount <= 0) return
            const label = extraLabel.trim() || tr(budgetCategoryKey(extraKind))
            useStore.getState().apply('Add extra', (draft) => {
              draft.budget.extras ??= []
              draft.budget.extras.push({ id: newId('extra'), label, amount, kind: extraKind })
            })
            setExtraLabel('')
            setExtraAmount('')
            setExtraKind('labour')
          }}
        >
          <T k="Add line" />
        </button>
      </div>
      {(budget.extras ?? []).length > 0 && (
        <ul className="budget-extras">
          {(budget.extras ?? []).map((extra) => (
            <li key={extra.id}>
              <label className="field">
                {tr('Label')}
                <input
                  aria-label={`${tr('Label')} ${extra.label}`}
                  value={extra.label}
                  onChange={(event) => patchExtra(extra.id, (found) => {
                    found.label = event.target.value
                  })}
                />
              </label>
              <label className="field">
                {tr('Amount')}
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label={`${tr('Amount')} ${extra.label}`}
                  value={extra.amount}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (!Number.isFinite(next) || next < 0) return
                    patchExtra(extra.id, (found) => {
                      found.amount = next
                    })
                  }}
                />
              </label>
              <label className="field">
                {tr('Kind')}
                <select
                  aria-label={`${tr('Kind')} ${extra.label}`}
                  value={extra.kind}
                  onChange={(event) => {
                    const kind = event.target.value
                    if (kind !== 'labour' && kind !== 'fees' && kind !== 'other') return
                    patchExtra(extra.id, (found) => {
                      found.kind = kind
                    })
                  }}
                >
                  <option value="labour">{tr('Labour')}</option>
                  <option value="fees">{tr('Fees')}</option>
                  <option value="other">{tr('Other')}</option>
                </select>
              </label>
              <button type="button" onClick={() => removeExtra(extra.id)}>
                <T k="Remove" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {compared.length > 1 && (
        <>
          <h3 className="budget-section-title">
            <T k="Variant comparison" />
          </h3>
          <table className="budget-variants">
            <thead>
              <tr>
                <th>{tr('Name')}</th>
                <th>{tr('Total')}</th>
                <th>{tr('Difference')}</th>
              </tr>
            </thead>
            <tbody>
              {compared.map((row) => (
                <tr key={row.id}>
                  <td>{row.id === 'current' ? tr('Current design') : row.name}</td>
                  <td>{money(row.total)}</td>
                  <td>{row.id === 'current' ? '—' : signedMoney(row.difference, money)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="budget-actions">
        <button type="button" onClick={() => void exportCsv()}>
          <T k="Export CSV" />
        </button>
        <button type="button" onClick={() => void exportPdf()}>
          <T k="Export PDF" />
        </button>
      </div>
    </div>
  )
}

function setLineQuote(id: string, raw: string) {
  useStore.getState().apply('Quote line', (draft) => {
    if (raw.trim() === '') {
      if (!draft.budget.overrides) return
      delete draft.budget.overrides[id]
      if (Object.keys(draft.budget.overrides).length === 0) delete draft.budget.overrides
      return
    }
    const next = Number(raw)
    if (!Number.isFinite(next) || next < 0) return
    draft.budget.overrides ??= {}
    draft.budget.overrides[id] = next
  })
}

function setItemPrice(id: string, raw: string) {
  useStore.getState().apply('Item price', (draft) => {
    for (const level of draft.levels) {
      const found = level.items.find((item) => item.id === id)
      if (!found) continue
      if (raw.trim() === '') delete found.price
      else {
        const next = Number(raw)
        if (Number.isFinite(next) && next >= 0) found.price = next
      }
      return
    }
  })
}

function patchExtra(id: string, recipe: (extra: BudgetExtra) => void) {
  useStore.getState().apply('Edit extra', (draft) => {
    const found = draft.budget.extras?.find((extra) => extra.id === id)
    if (found) recipe(found)
  })
}

function removeExtra(id: string) {
  useStore.getState().apply('Remove extra', (draft) => {
    draft.budget.extras = (draft.budget.extras ?? []).filter((extra) => extra.id !== id)
    if (draft.budget.extras.length === 0) delete draft.budget.extras
  })
}

registerPanel({
  id: 'budget',
  title: 'Budget',
  placement: 'right',
  icon: icon('<path d="M6 6h12v12H6z"/><path d="M9 10h6M9 14h4"/>'),
  Component: BudgetPanel,
})
