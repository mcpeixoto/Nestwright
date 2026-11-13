import { useStore } from '../../../store'
import { deleteSelection } from '../../actions'
import { selectionFacts } from '../facts'
import { registerInspectorSection } from '../registry'

function MultiSection() {
  const count = useStore((s) => s.selection.length)
  return (
    <div className="props">
      <h2>{count} selected</h2>
      <button type="button" className="danger" onClick={deleteSelection}>
        Delete
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
