import { useSyncExternalStore } from 'react'
import { getPlanCursor, subscribePlanCursor } from '../plan2d/cursor'
import { formatLength } from '../model/units'
import { useStore } from '../store'

export function StatusBar() {
  const units = useStore((s) => s.project.units)
  const snapGrid = useStore((s) => s.snapGrid)
  const snapEnds = useStore((s) => s.snapEnds)
  const snapAngles = useStore((s) => s.snapAngles)
  const message = useStore((s) => s.message)
  const cursor = useSyncExternalStore(subscribePlanCursor, getPlanCursor, () => null)

  return (
    <footer className="statusbar">
      <span className="coords">
        {cursor ? `${formatLength(cursor.x, units)} , ${formatLength(cursor.y, units)}` : '—'}
      </span>
      <button type="button" className={snapGrid ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapGrid: !snapGrid })}>
        Grid
      </button>
      <button type="button" className={snapEnds ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapEnds: !snapEnds })}>
        Joints
      </button>
      <button type="button" className={snapAngles ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapAngles: !snapAngles })}>
        Angles
      </button>
      <button
        type="button"
        onClick={() => {
          const next = units === 'metric' ? 'imperial' : 'metric'
          useStore.getState().apply('Units', (draft) => {
            draft.units = next
          })
        }}
      >
        {units === 'metric' ? 'Metric' : 'Imperial'}
      </button>
      <span className="status-msg">{message}</span>
    </footer>
  )
}
