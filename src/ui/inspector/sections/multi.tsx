import { useStore } from '../../../store'
import { deleteSelection } from '../../actions'
import { selectionFacts } from '../facts'
import { registerInspectorSection } from '../registry'
import { T } from '../../../i18n/T'
import { useTranslate } from '../../../i18n'

function MultiSection() {
  const tr = useTranslate()
  const count = useStore((s) => s.selection.length)
  return (
    <div className="props">
      <h2>{tr('{count} selected', { count })}</h2>
      <button type="button" className="danger" onClick={deleteSelection}>
        <T k="Delete" />
      </button>
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
