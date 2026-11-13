import {
  KITCHEN_MODULES,
  kitchenKind,
  readKitchen,
  writeKitchen,
  type KitchenModule,
  type KitchenModuleType,
  type KitchenSpec,
} from '../../model/kitchen'
import { selectActiveLevel, useStore } from '../../store'
import { selectionFacts } from './facts'
import { NumberField, patchLevel } from './fields'
import { registerInspectorSection } from './registry'

const LABELS: Record<KitchenModuleType, string> = {
  'base-drawers': 'Drawers',
  'base-doors': 'Doors',
  sink: 'Sink',
  hob: 'Hob',
  oven: 'Oven',
  dishwasher: 'Dishwasher',
  'fridge-tall': 'Fridge',
  corner: 'Corner',
  'open-shelf': 'Open shelf',
}

function update(id: string, kind: NonNullable<ReturnType<typeof kitchenKind>>, recipe: (spec: KitchenSpec) => void) {
  patchLevel('Kitchen', (level) => {
    const item = level.items.find((entry) => entry.id === id)
    if (!item) return
    const spec = readKitchen(item.params, kind)
    recipe(spec)
    writeKitchen(item, spec, kind)
  })
}

function ModuleList({
  title,
  modules,
  onChange,
}: {
  title: string
  modules: KitchenModule[]
  onChange: (next: KitchenModule[]) => void
}) {
  const move = (index: number, dir: -1 | 1) => {
    const next = modules.map((module) => ({ ...module }))
    const swap = index + dir
    const a = next[index]
    const b = next[swap]
    if (!a || !b) return
    next[index] = b
    next[swap] = a
    onChange(next)
  }
  return (
    <div className="props">
      <h2>{title}</h2>
      {modules.map((module, index) => (
        <div className="mod-row" key={`${module.type}-${index}`}>
          <select
            aria-label={`${title} ${index + 1} type`}
            value={module.type}
            onChange={(event) => {
              const type = event.target.value as KitchenModuleType
              onChange(modules.map((entry, i) => (i === index ? { ...entry, type } : entry)))
            }}
          >
            {KITCHEN_MODULES.map((type) => (
              <option key={type} value={type}>
                {LABELS[type]}
              </option>
            ))}
          </select>
          <input
            aria-label={`${title} ${index + 1} width`}
            inputMode="decimal"
            value={String(Math.round(module.width * 1000) / 1000)}
            onChange={(event) => {
              const width = Number(event.target.value)
              if (!Number.isFinite(width)) return
              onChange(modules.map((entry, i) => (i === index ? { ...entry, width: Math.min(2.4, Math.max(0.15, width)) } : entry)))
            }}
          />
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move module up">
            ↑
          </button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === modules.length - 1} aria-label="Move module down">
            ↓
          </button>
          <button
            type="button"
            onClick={() => onChange(modules.filter((_, i) => i !== index))}
            disabled={modules.length < 2}
            aria-label="Remove module"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...modules, { type: 'base-doors', width: 0.6 }])}>
        Add module
      </button>
    </div>
  )
}

function KitchenSection() {
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const item = level?.items.find((entry) => entry.id === id)
  const kind = item ? kitchenKind(item.catalogId) : null
  if (!item || !kind) return null
  const spec = readKitchen(item.params, kind)
  return (
    <div className="props">
      <ModuleList title={kind === 'l' ? 'Main run' : 'Modules'} modules={spec.modules} onChange={(modules) => update(id, kind, (next) => { next.modules = modules })} />
      {kind === 'l' && (
        <ModuleList title="Return run" modules={spec.returns} onChange={(returns) => update(id, kind, (next) => { next.returns = returns })} />
      )}
      <label className="check">
        <input type="checkbox" checked={spec.wall} onChange={(event) => update(id, kind, (next) => { next.wall = event.target.checked })} />
        Wall cabinets
      </label>
      {spec.wall && (
        <NumberField label="Wall height" value={spec.wallH} step={0.05} onCommit={(value) => update(id, kind, (next) => { next.wallH = Math.max(0.2, value) })} />
      )}
      <label className="field">
        Handles
        <select value={spec.handle} onChange={(event) => update(id, kind, (next) => { next.handle = event.target.value as KitchenSpec['handle'] })}>
          <option value="bar">Bar</option>
          <option value="knob">Knob</option>
          <option value="groove">Groove</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={spec.plinth} onChange={(event) => update(id, kind, (next) => { next.plinth = event.target.checked })} />
        Plinth
      </label>
      <label className="check">
        <input type="checkbox" checked={spec.hood} onChange={(event) => update(id, kind, (next) => { next.hood = event.target.checked })} />
        Hood over hob
      </label>
    </div>
  )
}

registerInspectorSection({
  id: 'kitchen',
  order: 35,
  title: 'Kitchen',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    const item = facts.items[0]
    return facts.total === 1 && !!item && kitchenKind(item.catalogId) !== null
  },
  Component: KitchenSection,
})
