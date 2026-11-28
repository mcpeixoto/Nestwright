import { useState } from 'react'
import { bulgeLimit } from '../../../model/curve'
import type { RoofShape, StairShape } from '../../../model/types'
import { selectActiveLevel, useStore } from '../../../store'
import { halfWallHeight, setHalfWallHeight, setWallDrawKind, wallDrawKind, type WallDrawKind } from '../../../tools/wallOptions'
import { MaterialPicker } from '../../MaterialPicker'
import { selectionFacts } from '../facts'
import { labelOf, LengthField, patchLevel } from '../fields'
import { registerInspectorSection, type InspectorSectionProps } from '../registry'
import { T } from '../../../i18n/T'
import { useTranslate } from '../../../i18n'

const STAIR_SHAPES: StairShape[] = ['straight', 'l-shape', 'u-shape', 'spiral']
const ROOF_SHAPES: RoofShape[] = ['flat', 'shed', 'gable', 'hip', 'mansard', 'dome']

function StairSection({ selection }: InspectorSectionProps) {
  const tr = useTranslate()
  const id = selection[0] ?? ''
  const level = useStore(selectActiveLevel)
  const stair = level?.stairs.find((item) => item.id === id)
  if (!stair || !level) return null
  return (
    <div className="card-body">
      <label className="field">
        <T k="Shape" />
        <select
          value={stair.shape}
          onChange={(event) => {
            const shape = event.target.value as StairShape
            patchLevel('Stair shape', (draft) => {
              const found = draft.stairs.find((item) => item.id === id)
              if (found) found.shape = shape
            })
          }}
        >
          {STAIR_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {tr(labelOf(shape))}
            </option>
          ))}
        </select>
      </label>
      <LengthField
        label="Width"
        value={stair.width}
        onCommit={(value) =>
          patchLevel('Stair width', (draft) => {
            const found = draft.stairs.find((item) => item.id === id)
            if (found && value >= 0.6 && value <= 3) found.width = value
          })
        }
      />
      <LengthField
        label="Rise"
        value={stair.rise > 0.05 ? stair.rise : level.height}
        onCommit={(value) =>
          patchLevel('Stair rise', (draft) => {
            const found = draft.stairs.find((item) => item.id === id)
            if (found && value > 0.2) found.rise = value
          })
        }
      />
      {stair.shape === 'l-shape' || stair.shape === 'u-shape' ? (
        <label className="field">
          <T k="Turn" />
          <select
            value={stair.turnLeft === false ? 'right' : 'left'}
            onChange={(event) => {
              const turnLeft = event.target.value === 'left'
              patchLevel('Stair turn', (draft) => {
                const found = draft.stairs.find((item) => item.id === id)
                if (found) found.turnLeft = turnLeft
              })
            }}
          >
            <option value="left">{tr('Left')}</option>
            <option value="right">{tr('Right')}</option>
          </select>
        </label>
      ) : null}
      <label className="check">
        <input
          type="checkbox"
          checked={stair.railing}
          onChange={(event) => {
            const railing = event.target.checked
            patchLevel('Stair railing', (draft) => {
              const found = draft.stairs.find((item) => item.id === id)
              if (found) found.railing = railing
            })
          }}
        />
        <T k="Railing" />
      </label>
      <label className="field">
        <T k="Material" />
        <MaterialPicker
          value={stair.material}
          onChange={(next) =>
            patchLevel('Stair material', (draft) => {
              const found = draft.stairs.find((item) => item.id === id)
              if (found) found.material = next
            })
          }
        />
      </label>
    </div>
  )
}

function RoofSection({ selection }: InspectorSectionProps) {
  const tr = useTranslate()
  const id = selection[0] ?? ''
  const level = useStore(selectActiveLevel)
  const roof = level?.roofs.find((item) => item.id === id)
  if (!roof) return null
  const pitchDeg = Math.round((roof.pitch * 180) / Math.PI)
  const ridgeDeg = Math.round((roof.ridgeAngle * 180) / Math.PI)
  return (
    <div className="card-body">
      <label className="field">
        <T k="Shape" />
        <select
          value={roof.shape}
          onChange={(event) => {
            const shape = event.target.value as RoofShape
            patchLevel('Roof shape', (draft) => {
              const found = draft.roofs.find((item) => item.id === id)
              if (found) found.shape = shape
            })
          }}
        >
          {ROOF_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {tr(labelOf(shape))}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {tr('Pitch {n}°', { n: pitchDeg })}
        <input
          type="range"
          aria-label={tr('Pitch')}
          min={5}
          max={60}
          step={1}
          value={Math.min(60, Math.max(5, pitchDeg))}
          onChange={(event) => {
            const pitch = (Number(event.target.value) * Math.PI) / 180
            patchLevel('Roof pitch', (draft) => {
              const found = draft.roofs.find((item) => item.id === id)
              if (found) found.pitch = pitch
            })
          }}
        />
      </label>
      <LengthField
        label="Overhang"
        value={roof.overhang}
        allowZero
        onCommit={(value) =>
          patchLevel('Roof overhang', (draft) => {
            const found = draft.roofs.find((item) => item.id === id)
            if (found && value >= 0 && value <= 2) found.overhang = value
          })
        }
      />
      <label className="field">
        {tr('Ridge {n}°', { n: ridgeDeg })}
        <input
          type="range"
          aria-label={tr('Ridge')}
          min={-180}
          max={180}
          step={1}
          value={Math.min(180, Math.max(-180, ridgeDeg))}
          onChange={(event) => {
            const ridgeAngle = (Number(event.target.value) * Math.PI) / 180
            patchLevel('Roof ridge', (draft) => {
              const found = draft.roofs.find((item) => item.id === id)
              if (found) found.ridgeAngle = ridgeAngle
            })
          }}
        />
      </label>
      <button
        type="button"
        onClick={() =>
          patchLevel('Roof ridge', (draft) => {
            const found = draft.roofs.find((item) => item.id === id)
            if (found) found.ridgeAngle += Math.PI / 2
          })
        }
      >
        <T k="Rotate ridge 90°" />
      </button>
      <LengthField
        label="Thickness"
        value={roof.thickness}
        onCommit={(value) =>
          patchLevel('Roof thickness', (draft) => {
            const found = draft.roofs.find((item) => item.id === id)
            if (found && value >= 0.02 && value <= 0.4) found.thickness = value
          })
        }
      />
      <label className="field">
        <T k="Material" />
        <MaterialPicker
          value={roof.material}
          onChange={(next) =>
            patchLevel('Roof material', (draft) => {
              const found = draft.roofs.find((item) => item.id === id)
              if (found) found.material = next
            })
          }
        />
      </label>
      {roof.cutouts.length > 0 ? (
        <div className="props">
          {roof.cutouts.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() =>
                patchLevel('Remove skylight', (draft) => {
                  const found = draft.roofs.find((item) => item.id === id)
                  if (found) found.cutouts.splice(index, 1)
                })
              }
            >
              {tr('Remove skylight')} {index + 1}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ColumnSection({ selection }: InspectorSectionProps) {
  const id = selection[0] ?? ''
  const level = useStore(selectActiveLevel)
  const column = level?.columns.find((item) => item.id === id)
  if (!column) return null
  return (
    <div className="card-body">
      <LengthField
        label="Size"
        value={column.size}
        onCommit={(value) =>
          patchLevel('Column size', (draft) => {
            const found = draft.columns.find((item) => item.id === id)
            if (found && value >= 0.08 && value <= 1.5) found.size = value
          })
        }
      />
      <label className="check">
        <input
          type="checkbox"
          checked={column.round}
          onChange={(event) => {
            const round = event.target.checked
            patchLevel('Column shape', (draft) => {
              const found = draft.columns.find((item) => item.id === id)
              if (found) found.round = round
            })
          }}
        />
        <T k="Round" />
      </label>
      <label className="field">
        <T k="Material" />
        <MaterialPicker
          value={column.material}
          onChange={(next) =>
            patchLevel('Column material', (draft) => {
              const found = draft.columns.find((item) => item.id === id)
              if (found) found.material = next
            })
          }
        />
      </label>
    </div>
  )
}

function SlabSection({ selection }: InspectorSectionProps) {
  const id = selection[0] ?? ''
  const level = useStore(selectActiveLevel)
  const slab = level?.slabs.find((item) => item.id === id)
  if (!slab) return null
  return (
    <div className="card-body">
      <LengthField
        label="Thickness"
        value={slab.thickness}
        onCommit={(value) =>
          patchLevel('Slab thickness', (draft) => {
            const found = draft.slabs.find((item) => item.id === id)
            if (found && value >= 0.02 && value <= 0.6) found.thickness = value
          })
        }
      />
      <LengthField
        label="Top offset"
        value={slab.top}
        allowZero
        min={-50}
        onCommit={(value) =>
          patchLevel('Slab height', (draft) => {
            const found = draft.slabs.find((item) => item.id === id)
            if (found && Number.isFinite(value)) found.top = value
          })
        }
      />
      <label className="field">
        <T k="Material" />
        <MaterialPicker
          value={slab.material}
          onChange={(next) =>
            patchLevel('Slab material', (draft) => {
              const found = draft.slabs.find((item) => item.id === id)
              if (found) found.material = next
            })
          }
        />
      </label>
    </div>
  )
}

function CurveSection({ selection }: InspectorSectionProps) {
  const tr = useTranslate()
  const id = selection[0] ?? ''
  const level = useStore(selectActiveLevel)
  const wall = level?.walls.find((item) => item.id === id)
  if (!wall || wall.kind === 'railing') return null
  const limit = bulgeLimit(wall)
  return (
    <div className="card-body">
      <label className="field">
        {tr('Curve {bulge} m', { bulge: wall.bulge.toFixed(2) })}
        <input
          type="range"
          aria-label={tr('Curve')}
          min={-limit}
          max={limit}
          step={0.05}
          value={Math.min(limit, Math.max(-limit, wall.bulge))}
          onChange={(event) => {
            const bulge = Number(event.target.value)
            patchLevel('Curve wall', (draft) => {
              const found = draft.walls.find((item) => item.id === id)
              if (found) found.bulge = bulge
            })
          }}
        />
      </label>
    </div>
  )
}

function WallToolSection({ state }: InspectorSectionProps) {
  const tr = useTranslate()
  const [kind, setKind] = useState<WallDrawKind>(wallDrawKind())
  const [height, setHeight] = useState(halfWallHeight())
  if (state.tool !== 'wall') return null
  return (
    <div className="card-body">
      <label className="field">
        <T k="Wall kind" />
        <select
          value={kind}
          onChange={(event) => {
            const next = event.target.value === 'half' ? 'half' : 'wall'
            setWallDrawKind(next)
            setKind(next)
          }}
        >
          <option value="wall">{tr('Full height')}</option>
          <option value="half">{tr('Half wall')}</option>
        </select>
      </label>
      {kind === 'half' ? (
        <label className="field">
          {tr('Half height {h} m', { h: height.toFixed(2) })}
          <input
            type="range"
            aria-label={tr('Half height')}
            min={0.4}
            max={2.2}
            step={0.05}
            value={height}
            onChange={(event) => {
              const next = Number(event.target.value)
              setHalfWallHeight(next)
              setHeight(next)
            }}
          />
        </label>
      ) : null}
    </div>
  )
}

registerInspectorSection({
  id: 'stair',
  order: 34,
  title: 'Stair',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.stairs.length === 1
  },
  Component: StairSection,
})

registerInspectorSection({
  id: 'roof',
  order: 35,
  title: 'Roof',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.roofs.length === 1
  },
  Component: RoofSection,
})

registerInspectorSection({
  id: 'column',
  order: 36,
  title: 'Column',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.columns.length === 1
  },
  Component: ColumnSection,
})

registerInspectorSection({
  id: 'slab',
  order: 37,
  title: 'Floor slab',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.slabs.length === 1
  },
  Component: SlabSection,
})

registerInspectorSection({
  id: 'wall-curve',
  order: 32,
  title: 'Curve',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.walls.length === 1 && facts.walls[0]?.kind !== 'railing'
  },
  Component: CurveSection,
})

registerInspectorSection({
  id: 'wall-tool',
  order: 5,
  title: 'Wall tool',
  match: (_selection, state) => state.tool === 'wall',
  Component: WallToolSection,
})
