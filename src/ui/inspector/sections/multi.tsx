import { useStore } from '../../../store'
import { duplicateSelection, rotateSelectionQuarter } from '../../actions'
import { selectionFacts } from '../facts'
import { registerInspectorSection, type InspectorSectionProps } from '../registry'
import { useTranslate } from '../../../i18n'

function MultiSection({ selection, state }: InspectorSectionProps) {
  const tr = useTranslate()
  const count = useStore((s) => s.selection.length)
  const items = selectionFacts(selection, state).items.length
  return (
    <div className="card-body">
      <p className="card-subtitle">{tr('{count} selected', { count })}</p>
      {items > 0 && (
        <>
          <p className="readout multi-items">{tr('{count} items', { count: items })}</p>
          <div className="multi-actions">
            <button type="button" onClick={duplicateSelection}>
              {tr('Duplicate')}
            </button>
            <button type="button" onClick={rotateSelectionQuarter}>
              {tr('Rotate 90°')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

registerInspectorSection({
  id: 'multi',
  order: 20,
  title: 'Selection',
  match: (selection, state) => selectionFacts(selection, state).total > 1,
  Component: MultiSection,
})
