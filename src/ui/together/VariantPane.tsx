import { useEffect, useRef } from 'react'
import type { Project } from '../../model/types'
import { useStore } from '../../store'
import { getController, SceneController } from '../../view3d/SceneController'
import { getCompareVariant, useCompareVariant } from './compare'

export function VariantPane() {
  const variantId = useCompareVariant()
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!variantId) return
    const canvas = ref.current
    if (!canvas) return
    let controller: SceneController
    try {
      controller = new SceneController(canvas, { primary: false })
    } catch {
      return
    }
    const push = () => {
      const state = useStore.getState()
      const current = state.project.variants?.find((item) => item.id === variantId)
      if (!current) return
      const ghost: Project = { ...state.project, levels: current.levels ?? [], terrain: current.terrain }
      try {
        controller.sync(ghost, {
          activeLevelId: current.levels?.[0]?.id ?? state.activeLevelId,
          selection: [],
          levelDisplay: 'all',
          view: '3d',
          tool: 'select',
        })
        const pose = getController()?.pose()
        if (pose) controller.matchPose(pose)
      } catch {
        /* an empty or broken snapshot should not take down the live view */
      }
    }
    push()
    const unsub = useStore.subscribe(push)
    let lock = false
    const fromLeft = () => {
      if (lock) return
      const pose = getController()?.pose()
      if (!pose) return
      lock = true
      controller.matchPose(pose)
      lock = false
    }
    const fromRight = () => {
      if (lock) return
      const live = getController()
      const pose = controller.pose()
      if (!live || !pose) return
      lock = true
      live.matchPose(pose)
      lock = false
    }
    const left = getController()
    left?.controls?.addEventListener('change', fromLeft)
    controller.controls?.addEventListener('change', fromRight)
    return () => {
      unsub()
      left?.controls?.removeEventListener('change', fromLeft)
      controller.controls?.removeEventListener('change', fromRight)
      controller.dispose()
    }
  }, [variantId])

  if (!variantId) return null
  if (getCompareVariant() !== variantId) return null
  return (
    <div className="variant-pane">
      <canvas ref={ref} className="view3d-canvas" />
    </div>
  )
}
