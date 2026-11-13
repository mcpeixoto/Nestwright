import { getController } from '../../view3d/SceneController'

/** Small JPEG of the live 3D view. Returns '' when there is nothing to capture. */
export function captureThumb(): string {
  try {
    const canvas = getController()?.renderer?.domElement
    if (!canvas || canvas.width < 2 || canvas.height < 2 || typeof document === 'undefined') return ''
    const out = document.createElement('canvas')
    out.width = 160
    out.height = 100
    const ctx = out.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(canvas, 0, 0, out.width, out.height)
    const url = out.toDataURL('image/jpeg', 0.72)
    return url.startsWith('data:image/jpeg') ? url : ''
  } catch {
    return ''
  }
}
