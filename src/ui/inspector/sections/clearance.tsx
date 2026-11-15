import { useTranslate } from '../../../i18n'
import { issuesFor, WALKWAY_MIN } from '../../../model/clearance'
import { formatLength } from '../../../model/units'
import { clearanceFor, overlapIdsFor } from '../../../plan2d/layers/furniture'
import { selectActiveLevel, useStore } from '../../../store'
import { selectionFacts } from '../facts'
import { registerInspectorSection } from '../registry'

function ClearanceSection() {
  const tr = useTranslate()
  const id = useStore((s) => s.selection[0] ?? '')
  const level = useStore(selectActiveLevel)
  const units = useStore((s) => s.project.units)
  if (!level || !level.items.some((item) => item.id === id)) return null
  const overlaps = overlapIdsFor(level).has(id)
  const issues = issuesFor(clearanceFor(level), [id])
  if (!overlaps && issues.length === 0) return null
  const lines: string[] = []
  if (issues.some((issue) => issue.kind === 'door-swing')) lines.push(tr('Blocks the door swing'))
  for (const issue of issues) {
    if (issue.kind !== 'walkway') continue
    lines.push(tr('Walkway {gap} (min {min})', { gap: formatLength(issue.gap, units), min: formatLength(WALKWAY_MIN, units) }))
  }
  return (
    <div className="props clearance-hints">
      {overlaps && (
        <p className="warning-line" role="status">
          {tr('Overlaps another item or a wall')}
        </p>
      )}
      {lines.length > 0 && (
        <ul className="clearance-list" aria-label={tr('Clearance')}>
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

registerInspectorSection({
  id: 'item-clearance',
  order: 31,
  title: 'Clearance',
  match: (selection, state) => {
    const facts = selectionFacts(selection, state)
    return facts.total === 1 && facts.items.length === 1
  },
  Component: ClearanceSection,
})
