import { useSyncExternalStore } from 'react'
import { paintBrush, setPaintBrush, subscribePaintBrush } from '../../../tools/paint'
import { useStore } from '../../../store'
import { MaterialPicker } from '../../MaterialPicker'
import { registerInspectorSection } from '../registry'

function PaintSection() {
  const brush = useSyncExternalStore(subscribePaintBrush, paintBrush, paintBrush)
  const tool = useStore((s) => s.tool)
  if (tool !== 'paint') return null
  return (
    <div className="props">
      <h2>Paint</h2>
      <p className="hint">Click a wall side, floor, ceiling, roof, or a furniture material. Shift paints the ceiling. Alt-click picks up a material.</p>
      <MaterialPicker value={brush} onChange={setPaintBrush} />
    </div>
  )
}

registerInspectorSection({
  id: 'paint',
  order: 5,
  title: 'Paint',
  match: (_selection, state) => state.tool === 'paint',
  Component: PaintSection,
})
