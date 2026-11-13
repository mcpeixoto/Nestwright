import type { OpeningType } from '../../../model/types'
import { useStore } from '../../../store'
import { DOOR_TYPES, WINDOW_TYPES } from '../../../tools/openingTool'
import { labelOf } from '../fields'
import { registerInspectorSection } from '../registry'

function ToolSection() {
  const tool = useStore((s) => s.tool)
  const subtype = useStore((s) => s.openingSubtype)
  const types = tool === 'door' ? DOOR_TYPES : tool === 'window' ? WINDOW_TYPES : null
  if (!types) return null
  const value = types.includes(subtype) ? subtype : types[0]
  return (
    <label className="field">
      Placing
      <select value={value} onChange={(event) => useStore.getState().setOpeningSubtype(event.target.value as OpeningType)}>
        {types.map((type) => (
          <option key={type} value={type}>
            {labelOf(type)}
          </option>
        ))}
      </select>
    </label>
  )
}

registerInspectorSection({
  id: 'tool',
  order: 0,
  title: 'Tool',
  match: (_selection, state) => state.tool === 'door' || state.tool === 'window',
  Component: ToolSection,
})
