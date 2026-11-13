import { useSyncExternalStore } from 'react'
import { getPlanCursor, subscribePlanCursor } from '../plan2d/cursor'
import { polygonArea } from '../model/geometry'
import { formatArea, formatLength } from '../model/units'
import { useStore } from '../store'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'

export function StatusBar() {
  const tr = useTranslate()
  const units = useStore((s) => s.project.units)
  const snapGrid = useStore((s) => s.snapGrid)
  const snapEnds = useStore((s) => s.snapEnds)
  const snapAngles = useStore((s) => s.snapAngles)
  const message = useStore((s) => s.message)
  const boundary = useStore((s) => s.project.terrain?.boundary)
  const plotArea = formatArea(Math.abs(polygonArea(boundary ?? [])), units)
  const cursor = useSyncExternalStore(subscribePlanCursor, getPlanCursor, () => null)

  return (
    <footer className="statusbar">
      <span className="coords">
        {cursor ? `${formatLength(cursor.x, units)} , ${formatLength(cursor.y, units)}` : '—'}
      </span>
      <button type="button" className={snapGrid ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapGrid: !snapGrid })}>
        <T k="Grid" />
      </button>
      <button type="button" className={snapEnds ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapEnds: !snapEnds })}>
        <T k="Joints" />
      </button>
      <button type="button" className={snapAngles ? 'on' : ''} onClick={() => useStore.getState().setSnap({ snapAngles: !snapAngles })}>
        <T k="Angles" />
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
        {units === 'metric' ? tr('Metric') : tr('Imperial')}
      </button>
      <span>{plotArea}</span>
      <span className="status-msg">{message}</span>
    </footer>
  )
}
