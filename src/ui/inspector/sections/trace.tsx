import type { TraceImage } from '../../../model/types'
import { selectActiveLevel, useStore } from '../../../store'
import { startTraceCalibration } from '../../../tools/traceCalibrate'
import { importTraceImage } from '../../levelActions'
import { AngleField, LengthField } from '../fields'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'
import { useTranslate } from '../../../i18n'

function patchTrace(label: string, recipe: (trace: TraceImage) => void): void {
  const levelId = useStore.getState().activeLevelId
  useStore.getState().apply(label, (draft) => {
    const found = draft.traces.find((item) => item.levelId === levelId)
    if (found) recipe(found)
  })
}

function TraceSection() {
  const tr = useTranslate()
  const level = useStore(selectActiveLevel)
  const trace = useStore((s) => s.project.traces.find((item) => item.levelId === s.activeLevelId))
  if (!level || !trace) return null
  const locked = trace.locked === true
  const hidden = trace.visible === false
  return (
    <div className="card-body">
      <label className="field">
        <T k="Opacity" />
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={Math.min(1, Math.max(0.1, trace.opacity))}
          aria-label={tr('Opacity')}
          onChange={(event) => {
            const next = Number(event.target.value)
            patchTrace('Trace opacity', (draft) => {
              draft.opacity = next
            })
          }}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={locked}
          onChange={(event) => {
            const next = event.target.checked
            patchTrace('Lock trace', (draft) => {
              draft.locked = next
            })
          }}
        />
        <T k="Locked" />
      </label>
      <div className="trace-actions">
        <button
          type="button"
          onClick={() =>
            patchTrace(hidden ? 'Show trace' : 'Hide trace', (draft) => {
              draft.visible = draft.visible === false
            })
          }
        >
          <T k={hidden ? 'Show trace' : 'Hide trace'} />
        </button>
        <button type="button" onClick={() => startTraceCalibration()}>
          <T k="Calibrate…" />
        </button>
        <button type="button" onClick={() => void importTraceImage()}>
          <T k="Import trace image…" />
        </button>
      </div>
      <AngleField
        label="Rotation °"
        value={(trace.rotation * 180) / Math.PI}
        onCommit={(degrees) =>
          patchTrace('Rotate trace', (draft) => {
            draft.rotation = (degrees * Math.PI) / 180
          })
        }
      />
      {locked ? null : (
        <>
          <LengthField
            label="Origin X"
            value={trace.origin.x}
            allowZero
            min={-1000}
            max={1000}
            onCommit={(value) =>
              patchTrace('Move trace', (draft) => {
                if (draft.locked) return
                draft.origin.x = value
              })
            }
          />
          <LengthField
            label="Origin Y"
            value={trace.origin.y}
            allowZero
            min={-1000}
            max={1000}
            onCommit={(value) =>
              patchTrace('Move trace', (draft) => {
                if (draft.locked) return
                draft.origin.y = value
              })
            }
          />
        </>
      )}
      <button
        type="button"
        className="danger"
        onClick={() => {
          const levelId = level.id
          useStore.getState().apply('Remove trace', (draft) => {
            draft.traces = draft.traces.filter((item) => item.levelId !== levelId)
          })
        }}
      >
        <T k="Remove trace" />
      </button>
    </div>
  )
}

registerInspectorSection({
  id: 'trace',
  order: 12,
  title: 'Trace',
  match: (selection, state) =>
    selection.length === 0 && state.project.traces.some((item) => item.levelId === state.activeLevelId),
  Component: TraceSection,
})
