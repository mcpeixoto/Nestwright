import { estimateBudget, type BudgetCategory } from '../../model/budget'
import { formatMoney } from '../../model/money'
import { useSettings } from '../../settings'
import { useStore } from '../../store'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { icon } from '../../tools/icons'
import { registerPanel, setPanelOpen } from './registry'

const CATS: { id: BudgetCategory; label: string; color: string }[] = [
  { id: 'construction', label: 'Construction', color: '#e8b86d' },
  { id: 'finishes', label: 'Finishes', color: '#3fb8af' },
  { id: 'openings', label: 'Openings', color: '#8eaae6' },
  { id: 'items', label: 'Items', color: '#d4655a' },
  { id: 'terrain', label: 'Outside', color: '#8aaa72' },
]

export function BudgetPanel() {
  const tr = useTranslate()
  const locale = useSettings((s) => s.language)
  const project = useStore((s) => s.project)
  const budget = project.budget ?? { currency: 'EUR', buildCostPerM2: 1600, finishCostPerM2: {} }
  let estimate = estimateBudget(project)
  if (!Number.isFinite(estimate.total)) {
    estimate = { ...estimate, total: 0, delta: null }
  }
  const max = Math.max(...CATS.map((cat) => estimate.byCategory[cat.id]), 0)
  const money = (amount: number) => formatMoney(amount, estimate.currency, locale)

  return (
    <div className="props together-panel">
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
      <svg viewBox={`0 0 100 ${CATS.length * 10}`} width="100%" role="img" aria-label="Budget by category">
        {CATS.map((cat, index) => {
          const amount = estimate.byCategory[cat.id]
          const width = max > 0 ? (amount / max) * 100 : 0
          return (
            <g key={cat.id}>
              <rect x={0} y={index * 10} width={100} height={7} rx={2} fill="rgba(255,255,255,0.06)" />
              <rect x={0} y={index * 10} width={Math.max(0, width)} height={7} rx={2} fill={cat.color} />
            </g>
          )
        })}
      </svg>
      {CATS.map((cat) => (
        <div className="bar-label" key={cat.id}>
          <span>{tr(cat.label)}</span>
          <span />
          <span>{money(estimate.byCategory[cat.id])}</span>
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
              <td>{room.name}</td>
              <td>{money(room.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

registerPanel({
  id: 'budget',
  title: 'Budget',
  placement: 'right',
  icon: icon('<path d="M6 6h12v12H6z"/><path d="M9 10h6M9 14h4"/>'),
  Component: BudgetPanel,
})
