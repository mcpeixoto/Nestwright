import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { fitVisible } from '../ui/fit'
import { SceneController } from './SceneController'

export function Viewport3D() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const controller = new SceneController(canvas)
    const sync = () => {
      const state = useStore.getState()
      controller.sync(state.project, {
        activeLevelId: state.activeLevelId,
        selection: state.selection,
        levelDisplay: state.levelDisplay,
        view: state.view,
        tool: state.tool,
      })
    }
    sync()
    const stop = useStore.subscribe(sync)
    return () => {
      stop()
      controller.dispose()
    }
  }, [])

  return (
    <div className="view3d-wrap">
      <canvas ref={ref} className="view3d-canvas" />
      <button type="button" className="fit-btn" onClick={() => fitVisible()}>
        Fit
      </button>
    </div>
  )
}
