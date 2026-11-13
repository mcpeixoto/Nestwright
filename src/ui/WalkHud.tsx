import { useEffect, useState } from 'react'
import { useTranslate } from '../i18n'
import { useSettings } from '../settings'
import { readFps } from '../view3d/rigs/walk'

export function WalkHud() {
  const debug = useSettings((s) => s.showFps)
  const tr = useTranslate()
  const [fps, setFps] = useState(0)

  useEffect(() => {
    if (!debug) return
    let timer = 0
    const tick = () => {
      setFps(Math.round(readFps()))
      timer = window.setTimeout(tick, 250)
    }
    timer = window.setTimeout(tick, 250)
    return () => window.clearTimeout(timer)
  }, [debug])

  return (
    <div className="walk-hud">
      <div className="crosshair" aria-hidden="true" />
      <div className="walk-hint">{tr('E: light · C: cat · Esc: exit')}</div>
      {debug && <div className="walk-fps">{tr('{n} fps', { n: fps })}</div>}
    </div>
  )
}
