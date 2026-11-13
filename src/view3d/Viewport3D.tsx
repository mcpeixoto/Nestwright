import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { fitVisible } from '../ui/fit'
import { FrameGuide } from '../ui/PhotoMode'
import { usePhotoSession } from '../ui/photoSession'
import { WalkHud } from '../ui/WalkHud'
import { SceneController } from './SceneController'
import { T } from '../i18n/T'

export function Viewport3D() {
  const ref = useRef<HTMLCanvasElement>(null)
  const view = useStore((s) => s.view)
  const photo = usePhotoSession().photo

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
    <div className={view === 'walk' || photo ? 'view3d-wrap quiet' : 'view3d-wrap'}>
      <canvas ref={ref} className="view3d-canvas" />
      {view === 'walk' && !photo && <WalkHud />}
      <FrameGuide />
      <button type="button" className="fit-btn" onClick={() => fitVisible()}>
        <T k="Fit" />
      </button>
    </div>
  )
}
