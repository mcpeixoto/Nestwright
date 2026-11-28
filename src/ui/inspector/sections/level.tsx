import { levelAreas } from '../../../model/areas'
import { formatArea } from '../../../model/units'
import { roomsFor, selectActiveLevel, useStore } from '../../../store'
import { useTranslate } from '../../../i18n'
import { importTraceImage } from '../../levelActions'
import { levelDisplayName } from '../../../i18n/rooms'
import { useSettings } from '../../../settings'
import { selectionFacts } from '../facts'
import { NumberField, patchLevel } from '../fields'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'

function LevelSection() {
  const level = useStore(selectActiveLevel)
  const units = useStore((s) => s.project.units)
  const hasTrace = useStore((s) => s.project.traces.some((item) => item.levelId === s.activeLevelId))
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  if (!level) return null
  const areas = levelAreas(level, roomsFor(level))
  return (
    <div className="props">
      <h2><T k="Level" /></h2>
      <label className="field">
        <T k="Name" />
        <input
          value={levelDisplayName(language, level.name)}
          onChange={(event) => {
            const next = event.target.value
            patchLevel('Rename level', (draft) => {
              draft.name = next
            })
          }}
        />
      </label>
      {areas.rooms > 0 ? (
        <p className="readout">
          {tr('Net area {area}', { area: formatArea(areas.net, units) })}
          <br />
          {tr('Gross area {area}', { area: formatArea(areas.gross, units) })}
          {areas.outdoor > 0 ? (
            <>
              <br />
              {tr('Outdoor {area}', { area: formatArea(areas.outdoor, units) })}
            </>
          ) : null}
          <br />
          <span className="hint">{tr('Net floor area, inside the wall faces')}</span>
        </p>
      ) : null}
      <NumberField
        label="Height"
        value={level.height}
        step={0.05}
        onCommit={(value) =>
          patchLevel('Level height', (draft) => {
            if (value > 0.2) draft.height = value
          })
        }
      />
      <NumberField
        label="Elevation"
        value={level.elevation}
        step={0.1}
        onCommit={(value) =>
          patchLevel('Level elevation', (draft) => {
            draft.elevation = value
          })
        }
      />
      <NumberField
        label="Slab"
        value={level.slabThickness}
        step={0.01}
        onCommit={(value) =>
          patchLevel('Slab thickness', (draft) => {
            if (value > 0) draft.slabThickness = value
          })
        }
      />
      {hasTrace ? null : (
        <button type="button" onClick={() => void importTraceImage()}>
          <T k="Import trace image…" />
        </button>
      )}
      <p className="hint"><T k="Select a wall, opening, room or piece of furniture." /></p>
    </div>
  )
}

registerInspectorSection({
  id: 'level',
  order: 10,
  title: 'Level',
  match: (selection, state) => selectionFacts(selection, state).total === 0,
  Component: LevelSection,
})
