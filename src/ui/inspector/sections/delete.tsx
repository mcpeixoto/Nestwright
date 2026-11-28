import { T } from '../../../i18n/T'
import { deleteSelection } from '../../actions'
import { selectionFacts } from '../facts'
import { registerInspectorSection } from '../registry'

function DeleteSection() {
  return (
    <div className="card-body">
      <button type="button" className="danger" onClick={deleteSelection}>
        <T k="Delete" />
      </button>
    </div>
  )
}

registerInspectorSection({
  id: 'delete',
  order: 1000,
  title: 'Delete',
  match: (selection, state) => {
    if (selection.length === 0) return false
    const facts = selectionFacts(selection, state)
    const roomOnly = facts.room ? 1 : 0
    return facts.total - roomOnly > 0
  },
  Component: DeleteSection,
})
