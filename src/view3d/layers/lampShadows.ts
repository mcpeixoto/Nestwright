import type * as THREE from 'three'
import type { Project } from '../../model/types'
import { useSettings } from '../../settings'
import { registerSceneLayer } from '../layers'
import { roomAt } from '../lighting/focus'
import { createLampPool } from '../lighting/lampPool'
import { qualityProfile } from '../render/quality'

/** Cube-face size per pool light. Six faces each, so it stays small; Low (2 slots) halves it. */
function lampMapSize(slots: number): number {
  return slots >= 4 ? 512 : 256
}

registerSceneLayer({
  id: 'lamp-shadows',
  create(ctx) {
    const pool = createLampPool(ctx.scene, ctx.camera)
    let revision = ''
    let project: Project | null = null
    let activeLevelId = ''
    const indoor = (p: THREE.Vector3) =>
      project != null && roomAt(project, { activeLevelId, levelDisplay: 'all' }, { x: p.x, y: p.y, z: p.z }) != null
    return {
      sync(next, state) {
        project = next
        activeLevelId = state.activeLevelId
        revision = `${next.updatedAt}`
      },
      update() {
        const slots = qualityProfile(useSettings.getState().graphicsQuality).lampShadowSlots
        pool.update(slots, lampMapSize(slots), revision, indoor)
      },
      dispose() {
        pool.dispose()
      },
    }
  },
})
