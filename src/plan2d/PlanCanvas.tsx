import { useEffect, useRef } from 'react'
import { useTranslate } from '../i18n'
import { useStore } from '../store'
import { getTool } from '../tools/registry'
import { T } from '../i18n/T'
import { fitVisible } from '../ui/fit'
import { PlanInput } from './PlanInput'
import { PlanRenderer } from './PlanRenderer'

export function PlanCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const toolId = useStore((s) => s.tool)
  const cursor = getTool(toolId)?.cursor ?? 'default'
  const tr = useTranslate()
  const panning = toolId === 'pan'

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const renderer = new PlanRenderer(canvas)
    const input = new PlanInput(renderer)
    const stop = useStore.subscribe((state, prev) => {
      const immediate =
        state.project !== prev.project ||
        state.activeLevelId !== prev.activeLevelId ||
        state.levelDisplay !== prev.levelDisplay ||
        state.selection !== prev.selection ||
        state.showRoofs !== prev.showRoofs
      if (immediate) renderer.draw()
      else renderer.requestDraw()
    })
    const observer = new ResizeObserver(() => renderer.requestDraw())
    observer.observe(canvas)
    renderer.draw()
    return () => {
      stop()
      observer.disconnect()
      input.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="plan-wrap">
      <canvas ref={ref} className="plan-canvas" style={{ cursor }} />
      <div className="plan-corner">
        <button
          type="button"
          className={panning ? 'fit-btn on' : 'fit-btn'}
          title={tr('Pan')}
          aria-label={tr('Pan')}
          onClick={() => useStore.getState().setTool(panning ? 'select' : 'pan')}
        >
          <T k="Pan" />
        </button>
        <button type="button" className="fit-btn" onClick={() => fitVisible()}>
          <T k="Fit" />
        </button>
      </div>
    </div>
  )
}
