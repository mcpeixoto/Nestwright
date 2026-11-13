import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { getTool } from '../tools/registry'
import { fitVisible } from '../ui/fit'
import { PlanInput } from './PlanInput'
import { PlanRenderer } from './PlanRenderer'

export function PlanCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const toolId = useStore((s) => s.tool)
  const cursor = getTool(toolId)?.cursor ?? 'default'

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const renderer = new PlanRenderer(canvas)
    const input = new PlanInput(renderer)
    const stop = useStore.subscribe(() => renderer.requestDraw())
    const observer = new ResizeObserver(() => renderer.requestDraw())
    observer.observe(canvas)
    renderer.requestDraw()
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
      <button type="button" className="fit-btn" onClick={() => fitVisible()}>
        Fit
      </button>
    </div>
  )
}
