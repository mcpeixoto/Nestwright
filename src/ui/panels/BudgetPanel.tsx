import { estimateBudget, type BudgetCategory } from '../../model/budget'
import { useStore } from '../../store'
import { registerPanel } from './registry'

const CATS: { id: BudgetCategory; label: string; color: string }[] = [
  { id: 'construction', label: 'Construction', color: '#e8b86d' },
  { id: 'finishes', label: 'Finishes', color: '#3fb8af' },
  { id: 'openings', label: 'Openings', color: '#8eaae6' },
  { id: 'items', label: 'Items', color: '#d4655a' },
  { id: 'terrain', label: 'Outside', color: '#8aaa72' },
]

function money(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? Math.round(amount) : 0
  return `${currency} ${value}`
}

export function BudgetPanel() {
  const project = useStore((s) => s.project)
  const budget = project.budget ?? { currency: 'EUR', buildCostPerM2: 1600, finishCostPerM2: {} }
  let estimate = estimateBudget(project)
  if (!Number.isFinite(estimate.total)) {
    estimate = { ...estimate, total: 0, delta: null }
  }
  const max = Math.max(...CATS.map((cat) => estimate.byCategory[cat.id]), 0)

  return (
    <div className="props together-panel">
      <h2>Budget</h2>
      <p className="budget-total">{money(estimate.total, estimate.currency)}</p>
      {estimate.delta != null && (
        <p className={estimate.delta >= 0 ? 'under' : 'over'}>
          {estimate.delta >= 0 ? `Under by ${money(estimate.delta, estimate.currency)}` : `Over by ${money(-estimate.delta, estimate.currency)}`}
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
          <span>{cat.label}</span>
          <span />
          <span>{money(estimate.byCategory[cat.id], estimate.currency)}</span>
        </div>
      ))}
      <label className="field">
        Build cost per m²
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
        Currency
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
        Budget target
        <input
          type="number"
          min={0}
          step={100}
          value={budget.target ?? ''}
          placeholder="No target"
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
              <td>No rooms yet</td>
              <td>{money(0, estimate.currency)}</td>
            </tr>
          )}
          {estimate.byRoom.map((room) => (
            <tr key={room.key || 'outside'}>
              <td>{room.name}</td>
              <td>{money(room.total, estimate.currency)}</td>
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
  placement: 'bottom',
  Component: BudgetPanel,
})
