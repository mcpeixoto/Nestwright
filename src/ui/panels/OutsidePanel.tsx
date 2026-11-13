import { polygonArea } from '../../model/geometry'
import { flattenUnderHouse, FENCE_STYLES, PLANT_SPECIES, resampleTerrain, speciesProfile } from '../../model/terrain'
import type { GroundLayer } from '../../model/types'
import { GROUND_LAYERS } from '../../model/types'
import { formatArea } from '../../model/units'
import { useStore } from '../../store'
import { setBrush, useBrush, type SculptMode, type WaterKind } from '../../tools/brushState'
import { selectSpecies } from '../../tools/plant-brush'
import { icon } from '../../tools/icons'
import { NumberField } from '../inspector/fields'
import { registerPanel, setPanelOpen } from './registry'

const SPECIES_ICON: Record<string, string> = {
  oak: '<path d="M12 22V12"/><circle cx="12" cy="8" r="4"/>',
  birch: '<path d="M12 22V11"/><path d="M8 8c1 3 7 3 8 0-2-3-6-3-8 0z"/>',
  pine: '<path d="M12 22V6"/><path d="M12 6l5 6H7zM12 10l4 5H8z"/>',
  cypress: '<path d="M12 22V4"/><path d="M12 4c3 2 3 12 0 16-3-4-3-14 0-16z"/>',
  palm: '<path d="M12 22V10"/><path d="M12 10c-4 1-6-2-7-4 3 1 5 2 7 4 2-2 4-3 7-4-1 2-3 5-7 4z"/>',
  olive: '<path d="M12 22V13"/><ellipse cx="12" cy="9" rx="5" ry="3"/>',
  'fruit-tree': '<path d="M12 22V12"/><circle cx="12" cy="8" r="4"/><circle cx="10" cy="8" r="1"/>',
  'bush-round': '<circle cx="12" cy="13" r="5"/>',
  'bush-flowering': '<circle cx="12" cy="14" r="4"/><circle cx="9" cy="11" r="1.2"/><circle cx="14" cy="10" r="1.2"/>',
  'hedge-segment': '<rect x="4" y="10" width="16" height="8" rx="1"/>',
  'flowers-mixed': '<path d="M8 20V12M12 20V10M16 20V13"/><circle cx="8" cy="10" r="1.4"/><circle cx="12" cy="8" r="1.4"/><circle cx="16" cy="11" r="1.4"/>',
  sunflowers: '<path d="M12 22V12"/><circle cx="12" cy="9" r="3"/>',
  lavender: '<path d="M9 20V12M12 20V9M15 20V12"/><path d="M12 9c-2-3-1-5 0-6 1 1 2 3 0 6z"/>',
  'tall-grass': '<path d="M7 20c1-6 2-8 1-12M12 20c0-7 1-10 0-13M17 20c-1-6-1-8 0-12"/>',
  reeds: '<path d="M8 20V8M12 20V5M16 20V9"/>',
  'rock-small': '<path d="M8 16l2-4 3 2 3-3 2 5z"/>',
  'rock-large': '<path d="M5 18l3-6 4 2 3-5 4 9z"/>',
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="field">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}

function resize(partial: { width?: number; depth?: number; resolution?: number }) {
  useStore.getState().apply('Resize plot', (draft) => {
    const terrain = draft.terrain
    if (!terrain) return
    const width = partial.width ?? terrain.width
    const depth = partial.depth ?? terrain.depth
    const resolution = partial.resolution ?? terrain.resolution
    draft.terrain = resampleTerrain(
      terrain,
      Math.min(200, Math.max(4, width)),
      Math.min(200, Math.max(4, depth)),
      Math.min(128, Math.max(4, Math.round(resolution))),
    )
  })
}

function SpeciesPalette() {
  const species = useBrush().species
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
      {PLANT_SPECIES.map((id) => (
        <button
          type="button"
          key={id}
          className={species === id ? 'on' : ''}
          title={id}
          aria-label={id}
          onClick={() => {
            selectSpecies(id)
            useStore.getState().setTool('plant-brush')
          }}
          dangerouslySetInnerHTML={{ __html: icon(SPECIES_ICON[id] ?? '<circle cx="12" cy="12" r="3"/>') }}
        />
      ))}
    </div>
  )
}

function BrushControls() {
  const brush = useBrush()
  const tool = useStore((s) => s.tool)
  const sculpting = tool === 'terrain-sculpt'
  const painting = tool === 'ground-paint' || tool === 'path'
  const planting = tool === 'plant-brush'
  const watering = tool === 'water'
  const fencing = tool === 'fence'
  return (
    <div className="props">
      {sculpting && (
        <label className="field">
          Sculpt
          <select value={brush.sculpt} onChange={(event) => setBrush({ sculpt: event.target.value as SculptMode })}>
            {(['raise', 'lower', 'flatten', 'smooth'] as const).map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      )}
      {(sculpting || painting || planting || tool === 'path') && (
        <Slider label={tool === 'path' ? 'Width' : 'Radius'} min={1} max={20} step={0.5} value={brush.radius} onChange={(radius) => setBrush({ radius })} />
      )}
      {(sculpting || tool === 'ground-paint') && (
        <Slider label="Strength" min={0.05} max={1} step={0.05} value={brush.strength} onChange={(strength) => setBrush({ strength })} />
      )}
      {painting && (
        <label className="field">
          Layer
          <select value={brush.layer} onChange={(event) => setBrush({ layer: event.target.value as GroundLayer })}>
            {(tool === 'path' ? (['path', 'paving', 'gravel'] as const) : GROUND_LAYERS).map((layer) => (
              <option key={layer} value={layer}>
                {layer}
              </option>
            ))}
          </select>
        </label>
      )}
      {planting && (
        <Slider
          label="Density"
          min={0.02}
          max={6}
          step={0.02}
          value={brush.density}
          onChange={(density) => setBrush({ density })}
        />
      )}
      {watering && (
        <label className="field">
          Water
          <select value={brush.waterKind} onChange={(event) => setBrush({ waterKind: event.target.value as WaterKind })}>
            <option value="pond">Pond</option>
            <option value="pool">Pool</option>
            <option value="stream">Stream</option>
          </select>
        </label>
      )}
      {fencing && (
        <>
          <label className="field">
            Fence
            <select value={brush.fenceStyle} onChange={(event) => setBrush({ fenceStyle: event.target.value })}>
              {FENCE_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
          <Slider label="Height" min={0.4} max={2.4} step={0.05} value={brush.fenceHeight} onChange={(fenceHeight) => setBrush({ fenceHeight })} />
        </>
      )}
    </div>
  )
}

function OutsideBody() {
  const terrain = useStore((s) => s.project.terrain)
  const units = useStore((s) => s.project.units)
  const area = Math.abs(polygonArea(terrain?.boundary ?? []))
  return (
    <div className="props" style={{ overflow: 'auto', padding: 12, height: '100%' }}>
      <h2>Outside</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={terrain?.enabled !== false}
          onChange={(event) => {
            const enabled = event.target.checked
            useStore.getState().apply('Terrain', (draft) => {
              draft.terrain.enabled = enabled
            })
          }}
        />
        Terrain
      </label>
      <NumberField label="Width" value={terrain?.width ?? 0} step={1} onCommit={(width) => resize({ width })} />
      <NumberField label="Depth" value={terrain?.depth ?? 0} step={1} onCommit={(depth) => resize({ depth })} />
      <NumberField
        label="Resolution"
        value={terrain?.resolution ?? 0}
        step={1}
        onCommit={(resolution) => resize({ resolution })}
      />
      <button
        type="button"
        onClick={() => {
          useStore.getState().apply('Flatten under house', (draft) => flattenUnderHouse(draft))
        }}
      >
        Flatten under house
      </button>
      <p className="readout">
        Plot {formatArea(area, units)} · {terrain?.plants.length ?? 0} plants · {terrain?.water.length ?? 0} water
      </p>
      <BrushControls />
      <h2>Plants</h2>
      <SpeciesPalette />
    </div>
  )
}

const BRUSH_PANEL_TOOLS = new Set(['terrain-sculpt', 'ground-paint', 'plant-brush', 'path', 'water', 'fence', 'plot-boundary', 'ivy'])

useStore.subscribe((state, prev) => {
  if (state.tool === prev.tool) return
  if (BRUSH_PANEL_TOOLS.has(state.tool)) setPanelOpen('brush', true)
})

function BrushFloat() {
  const tool = useStore((s) => s.tool)
  const brush = useBrush()
  return (
    <div className="props">
      <h2>Brush</h2>
      <BrushControls />
      {tool === 'plant-brush' && <p className="hint">Shift-drag erases. Spacing follows {brush.species} ({speciesProfile(brush.species).spacing} m).</p>}
      {tool === 'water' && <p className="hint">Click a polygon. Enter finishes. Pools drag out as a rectangle.</p>}
      {tool === 'plot-boundary' && <p className="hint">Click corners, Enter closes. Drag an existing corner to edit it.</p>}
    </div>
  )
}

registerPanel({
  id: 'outside',
  title: 'Outside',
  placement: 'right',
  shortcut: 'o',
  icon: icon('<path d="M4 16c2-4 4-6 8-6s6 2 8 6"/><path d="M12 10V4"/><path d="M9 7h6"/>'),
  Component: OutsideBody,
})

registerPanel({
  id: 'brush',
  title: 'Brush',
  placement: 'floating',
  Component: BrushFloat,
})
