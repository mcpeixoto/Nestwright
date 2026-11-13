import { useStore } from '../../../store'
import { selectionFacts } from '../facts'
import { registerInspectorSection } from '../registry'
import { useTranslate } from '../../../i18n'

function MultiSection() {
  const tr = useTranslate()
  const count = useStore((s) => s.selection.length)
  return (
    <div className="props">
      <h2>{tr('{count} selected', { count })}</h2>
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
