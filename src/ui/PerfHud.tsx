import { useEffect, useState } from 'react'
import { useTranslate } from '../i18n'
import { useSettings } from '../settings'
import { readPerfHud, type PerfHudSnapshot } from '../view3d/perfMonitor'

function qualityName(tr: (key: string) => string, quality: string): string {
  if (quality === 'low') return tr('Low')
  if (quality === 'medium') return tr('Medium')
  if (quality === 'ultra') return tr('Ultra')
  return tr('High')
}

function ratioText(value: number): string {
  if (!Number.isFinite(value)) return '1'
  return String(Math.round(value * 100) / 100)
}

export function PerfHud() {
  const enabled = useSettings((s) => s.showFps)
  const tr = useTranslate()
  const [snap, setSnap] = useState<PerfHudSnapshot | null>(null)

  useEffect(() => {
    if (!enabled) return
    const tick = () => setSnap(readPerfHud())
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [enabled])

  if (!enabled || !snap) return null
  const draws = Math.round(snap.drawCalls)
  const triangles = Math.round(snap.triangles)
  return (
    <div className="perf-hud">
      <div>
        {tr('{n} fps', { n: Math.round(snap.fps) })}
        {'  '}
        {tr('p50 {n} ms', { n: snap.p50.toFixed(1) })}
        {'  '}
        {tr('p95 {n} ms', { n: snap.p95.toFixed(1) })}
      </div>
      <div>
        {tr('max {n} ms', { n: snap.max.toFixed(1) })}
        {'  '}
        {tr('Hitches {n}', { n: snap.hitches })}
      </div>
      <div>
        {tr('Draws {n}', { n: draws })}
        {'  '}
        {tr('Triangles {n}', { n: triangles })}
      </div>
      <div>
        {tr('Geometries {n}', { n: Math.round(snap.geometries) })}
        {'  '}
        {tr('Textures {n}', { n: Math.round(snap.textures) })}
        {'  '}
        {tr('Programs {n}', { n: Math.round(snap.programs) })}
      </div>
      <div>
        {tr('GPU {n} MB', { n: snap.gpuMemMB.toFixed(1) })}
        {'  '}
        {tr('Backend {name}', { name: snap.backend })}
      </div>
      <div>
        {tr('Render {w}×{h}', { w: snap.width, h: snap.height })}
        {'  '}
        {tr('Pixel ratio {n}', { n: ratioText(snap.pixelRatio) })}
        {'  '}
        {tr('Quality {name}', { name: qualityName(tr, snap.quality) })}
      </div>
    </div>
  )
}
