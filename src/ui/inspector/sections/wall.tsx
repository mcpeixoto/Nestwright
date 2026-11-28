import { selectActiveLevel, useStore } from '../../../store'
import { MaterialPicker } from '../../MaterialPicker'
import { selectionFacts } from '../facts'
import { LengthField, PercentField, patchLevel } from '../fields'
import { MIN_WALL_LENGTH, setWallLength } from '../../../model/ops/sizes'
import { wallLength } from '../../../model/walls'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'

function WallSection() {
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const wall = level?.walls.find((item) => item.id === id)
  if (!wall) return null
  return (
    <div className="card-body">
      <LengthField
        label="Length"
        value={wallLength(wall)}
        min={MIN_WALL_LENGTH}
        onCommit={(value) =>
          patchLevel('Wall length', (draft) => {
            setWallLength(draft, id, value)
          })
        }
      />
      <LengthField
        label="Thickness"
        value={wall.thickness}
        min={0.021}
        max={2}
        onCommit={(value) =>
          patchLevel('Wall thickness', (draft) => {
            const found = draft.walls.find((item) => item.id === id)
            if (found) found.thickness = value
          })
        }
      />
      <LengthField
        label="Height"
        value={wall.height}
        min={0.201}
        max={30}
        onCommit={(value) =>
          patchLevel('Wall height', (draft) => {
            const found = draft.walls.find((item) => item.id === id)
            if (found) found.height = value
          })
        }
      />
      <label className="field">
        <T k="Left side" />
        <MaterialPicker
          value={wall.left}
          onChange={(next) =>
            patchLevel('Wall material', (draft) => {
              const found = draft.walls.find((item) => item.id === id)
              if (found) found.left = next
            })
          }
        />
      </label>
      <label className="field">
        <T k="Right side" />
        <MaterialPicker
          value={wall.right}
          onChange={(next) =>
            patchLevel('Wall material', (draft) => {
              const found = draft.walls.find((item) => item.id === id)
              if (found) found.right = next
            })
          }
        />
      </label>
      <PercentField
        label="Ivy left"
        value={wall.ivy?.left ?? 0}
        onCommit={(value) =>
          patchLevel('Ivy', (draft) => {
            const found = draft.walls.find((item) => item.id === id)
            if (!found) return
            const ivy = { left: found.ivy?.left ?? 0, right: found.ivy?.right ?? 0 }
            ivy.left = Math.min(1, Math.max(0, value))
            found.ivy = ivy
          })
        }
      />
      <PercentField
        label="Ivy right"
        value={wall.ivy?.right ?? 0}
        onCommit={(value) =>
          patchLevel('Ivy', (draft) => {
            const found = draft.walls.find((item) => item.id === id)
            if (!found) return
            const ivy = { left: found.ivy?.left ?? 0, right: found.ivy?.right ?? 0 }
            ivy.right = Math.min(1, Math.max(0, value))
            found.ivy = ivy
          })
        }
      />
    </div>
  )
}

registerInspectorSection({
  id: 'wall',
  order: 30,
  title: 'Wall',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.walls.length === 1
  },
  Component: WallSection,
})
