import { carveBasin, FENCE_STYLES, PLANT_SPECIES, waterDepth } from '../../../model/terrain'
import type { Terrain } from '../../../model/types'
import { useStore } from '../../../store'
import { labelOf, NumberField } from '../fields'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'
import { useTranslate } from '../../../i18n'

function findWater(terrain: Terrain, id: string) {
  return terrain.water.find((body) => body.id === id)
}

function findFence(terrain: Terrain, id: string) {
  return terrain.fences.find((fence) => fence.id === id)
}

function findPlant(terrain: Terrain, id: string) {
  return terrain.plants.find((plant) => plant.id === id)
}

function WaterSection() {
  const tr = useTranslate()
  const id = useStore((s) => s.selection[0] ?? '')
  const body = useStore((s) => findWater(s.project.terrain, id))
  if (!body) return null
  const depth = waterDepth(body)
  return (
    <div className="props">
      <h2>{tr(labelOf(body.kind))}</h2>
      <label className="field">
        <T k="Kind" />
        <select
          value={body.kind}
          onChange={(event) => {
            const kind = event.target.value as Terrain['water'][number]['kind']
            useStore.getState().apply('Water kind', (draft) => {
              const found = findWater(draft.terrain, id)
              if (!found) return
              found.kind = kind
              if (kind === 'pool') carveBasin(draft.terrain, found.polygon, found.level - waterDepth(found), 0.45)
            })
          }}
        >
          <option value="pond">{tr('Pond')}</option>
          <option value="pool">{tr('Pool')}</option>
          <option value="stream">{tr('Stream')}</option>
        </select>
      </label>
      <NumberField
        label="Water level"
        value={body.level}
        step={0.05}
        onCommit={(level) => {
          useStore.getState().apply('Water level', (draft) => {
            const found = findWater(draft.terrain, id)
            if (!found || !Number.isFinite(level)) return
            found.level = level
            if (found.kind === 'pool') carveBasin(draft.terrain, found.polygon, level - waterDepth(found), 0.45)
          })
        }}
      />
      <NumberField
        label="Depth"
        value={depth}
        step={0.05}
        onCommit={(next) => {
          useStore.getState().apply('Water depth', (draft) => {
            const found = findWater(draft.terrain, id)
            if (!found || !(next > 0)) return
            found.depth = next
            if (found.kind === 'pool') carveBasin(draft.terrain, found.polygon, found.level - next, 0.45)
          })
        }}
      />
    </div>
  )
}

function FenceSection() {
  const tr = useTranslate()
  const id = useStore((s) => s.selection[0] ?? '')
  const fence = useStore((s) => findFence(s.project.terrain, id))
  if (!fence) return null
  const segments = Math.max(0, fence.points.length - 1)
  const gates = new Set(fence.gates ?? [])
  return (
    <div className="props">
      <h2><T k="Fence" /></h2>
      <label className="field">
        <T k="Style" />
        <select
          value={FENCE_STYLES.includes(fence.style as (typeof FENCE_STYLES)[number]) ? fence.style : FENCE_STYLES[0]}
          onChange={(event) => {
            const style = event.target.value
            useStore.getState().apply('Fence style', (draft) => {
              const found = findFence(draft.terrain, id)
              if (found) found.style = style
            })
          }}
        >
          {FENCE_STYLES.map((style) => (
            <option key={style} value={style}>
              {tr(labelOf(style))}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Height"
        value={fence.height}
        step={0.05}
        onCommit={(height) => {
          useStore.getState().apply('Fence height', (draft) => {
            const found = findFence(draft.terrain, id)
            if (found && height > 0.2) found.height = height
          })
        }}
      />
      {Array.from({ length: Math.min(segments, 12) }, (_, index) => (
        <label className="check" key={index}>
          <input
            type="checkbox"
            checked={gates.has(index)}
            onChange={(event) => {
              const on = event.target.checked
              useStore.getState().apply('Fence gate', (draft) => {
                const found = findFence(draft.terrain, id)
                if (!found) return
                const next = new Set(found.gates ?? [])
                if (on) next.add(index)
                else next.delete(index)
                found.gates = [...next].sort((a, b) => a - b)
              })
            }}
          />
          {tr('Gate on segment')} {index + 1}
        </label>
      ))}
    </div>
  )
}

function PlantSection() {
  const tr = useTranslate()
  const id = useStore((s) => s.selection[0] ?? '')
  const plant = useStore((s) => findPlant(s.project.terrain, id))
  if (!plant) return null
  return (
    <div className="props">
      <h2>{tr(labelOf(plant.species))}</h2>
      <label className="field">
        <T k="Species" />
        <select
          value={plant.species}
          onChange={(event) => {
            const species = event.target.value
            useStore.getState().apply('Plant species', (draft) => {
              const found = findPlant(draft.terrain, id)
              if (found) found.species = species
            })
          }}
        >
          {PLANT_SPECIES.map((species) => (
            <option key={species} value={species}>
              {tr(labelOf(species))}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Scale"
        value={plant.scale}
        step={0.05}
        onCommit={(scale) => {
          useStore.getState().apply('Plant scale', (draft) => {
            const found = findPlant(draft.terrain, id)
            if (found && scale > 0.05) found.scale = scale
          })
        }}
      />
      <NumberField
        label="Rotation °"
        value={(plant.rotation * 180) / Math.PI}
        step={15}
        onCommit={(degrees) => {
          useStore.getState().apply('Plant rotation', (draft) => {
            const found = findPlant(draft.terrain, id)
            if (found) found.rotation = (degrees * Math.PI) / 180
          })
        }}
      />
    </div>
  )
}

registerInspectorSection({
  id: 'water',
  order: 35,
  title: 'Water',
  match: (selection, state) =>
    selection.length === 1 && !!state.project.terrain && !!findWater(state.project.terrain, selection[0] ?? ''),
  Component: WaterSection,
})

registerInspectorSection({
  id: 'fence',
  order: 36,
  title: 'Fence',
  match: (selection, state) =>
    selection.length === 1 && !!state.project.terrain && !!findFence(state.project.terrain, selection[0] ?? ''),
  Component: FenceSection,
})

registerInspectorSection({
  id: 'plant',
  order: 37,
  title: 'Plant',
  match: (selection, state) =>
    selection.length === 1 && !!state.project.terrain && !!findPlant(state.project.terrain, selection[0] ?? ''),
  Component: PlantSection,
})
