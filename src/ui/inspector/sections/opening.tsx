import { openingSize } from '../../../model/defaults'
import type { OpeningType } from '../../../model/types'
import { selectActiveLevel, useStore } from '../../../store'
import { DOOR_TYPES, WINDOW_TYPES } from '../../../tools/openingTool'
import { selectionFacts } from '../facts'
import { labelOf, LengthField, patchLevel } from '../fields'
import { openingGap, setOpeningGap } from '../../../model/ops/sizes'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'
import { useTranslate } from '../../../i18n'

function OpeningSection() {
  const tr = useTranslate()
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const opening = level?.openings.find((item) => item.id === id)
  const wall = opening ? level?.walls.find((item) => item.id === opening.wallId) : undefined
  if (!level || !opening) return null
  const placeGap = (side: 'a' | 'b', gap: number): boolean => {
    if (!setOpeningGap(structuredClone(level), id, side, gap)) return false
    patchLevel('Opening position', (draft) => {
      setOpeningGap(draft, id, side, gap)
    })
    return true
  }
  const types: OpeningType[] = [...DOOR_TYPES, ...WINDOW_TYPES]
  return (
    <div className="props">
      <h2>{tr(labelOf(opening.type))}</h2>
      <label className="field">
        <T k="Type" />
        <select
          value={opening.type}
          onChange={(event) => {
            const type = event.target.value as OpeningType
            const size = openingSize(type)
            patchLevel('Opening type', (draft) => {
              const found = draft.openings.find((item) => item.id === id)
              if (!found) return
              found.type = type
              found.width = size.width
              found.height = size.height
              found.sill = size.sill
            })
          }}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {tr(labelOf(type))}
            </option>
          ))}
        </select>
      </label>
      {wall ? (
        <>
          <LengthField
            label="From start"
            value={openingGap(wall, opening, 'a')}
            allowZero
            onCommit={(value) => placeGap('a', value)}
          />
          <LengthField
            label="From end"
            value={openingGap(wall, opening, 'b')}
            allowZero
            onCommit={(value) => placeGap('b', value)}
          />
          <p className="hint"><T k="Drag along the wall to move it" /></p>
        </>
      ) : null}
      <LengthField
        label="Width"
        value={opening.width}
        min={0.201}
        max={20}
        onCommit={(value) =>
          patchLevel('Opening width', (draft) => {
            const found = draft.openings.find((item) => item.id === id)
            if (found) found.width = value
          })
        }
      />
      <LengthField
        label="Height"
        value={opening.height}
        min={0.201}
        max={20}
        onCommit={(value) =>
          patchLevel('Opening height', (draft) => {
            const found = draft.openings.find((item) => item.id === id)
            if (found) found.height = value
          })
        }
      />
      <LengthField
        label="Sill"
        value={opening.sill}
        allowZero
        max={20}
        onCommit={(value) =>
          patchLevel('Opening sill', (draft) => {
            const found = draft.openings.find((item) => item.id === id)
            if (found) found.sill = value
          })
        }
      />
      <label className="check">
        <input
          type="checkbox"
          checked={opening.flipHinge === true}
          onChange={(event) => {
            const checked = event.target.checked
            patchLevel('Opening hinge', (draft) => {
              const found = draft.openings.find((item) => item.id === id)
              if (found) found.flipHinge = checked
            })
          }}
        />
        <T k="Flip hinge" />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={opening.flipSide === true}
          onChange={(event) => {
            const checked = event.target.checked
            patchLevel('Opening swing', (draft) => {
              const found = draft.openings.find((item) => item.id === id)
              if (found) found.flipSide = checked
            })
          }}
        />
        <T k="Flip swing" />
      </label>
    </div>
  )
}

registerInspectorSection({
  id: 'opening',
  order: 30,
  title: 'Opening',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.openings.length === 1
  },
  Component: OpeningSection,
})
