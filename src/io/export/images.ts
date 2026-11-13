import { getPlatform } from '../../platform'
import { useStore } from '../../store'
import type { Level, Project } from '../../model/types'
import { listPlanLayers, type PlanDrawContext } from '../../plan2d/layers'
import '../../plan2d/layers/builtin'
import { renderFrame } from '../../view3d/post/pipeline'
import { getController } from '../../view3d/SceneController'
import { buildPlanPdf } from './planPdf'
import { bytesToDataUrl } from './binary'

const PX = 50

function fileName(name: string, ext: string): string {
  const clean = name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || 'project'
  return `${clean}.${ext}`
}

async function save(name: string, data: string): Promise<void> {
  if (!data) {
    useStore.getState().setMessage('Nothing to export')
    return
  }
  const ok = await getPlatform().saveFile(name, data)
  useStore.getState().setMessage(ok ? `Saved ${name}` : 'Export cancelled')
}

export async function exportViewImage(width: number, height: number): Promise<void> {
  const controller = getController()
  const renderer = controller?.renderer
  const camera = controller?.camera
  if (!controller || !renderer || !camera) {
    useStore.getState().setMessage('The 3D view is not ready')
    return
  }
  const canvas = renderer.domElement
  const prevRatio = renderer.getPixelRatio()
  const clientW = Math.max(2, canvas.clientWidth)
  const clientH = Math.max(2, canvas.clientHeight)
  const prevAspect = camera.aspect
  const max = renderer.capabilities?.maxTextureSize ?? 4096
  let w = Math.max(2, Math.round(width))
  let h = Math.max(2, Math.round(height))
  if (Math.max(w, h) > max) {
    const scale = max / Math.max(w, h)
    w = Math.max(2, Math.round(w * scale))
    h = Math.max(2, Math.round(h * scale))
  }
  let url: string
  try {
    renderer.setPixelRatio(1)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderFrame(renderer, controller.scene, camera, { width: w, height: h })
    url = canvas.toDataURL('image/png')
  } catch (err) {
    console.error(err)
    useStore.getState().setMessage('Could not render the image')
    return
  } finally {
    renderer.setPixelRatio(prevRatio)
    renderer.setSize(clientW, clientH, false)
    camera.aspect = prevAspect > 0.05 ? prevAspect : clientW / clientH
    camera.updateProjectionMatrix()
    try {
      renderFrame(renderer, controller.scene, camera)
    } catch {
      renderer.render(controller.scene, camera)
    }
  }
  await save(fileName(useStore.getState().project.name, 'png'), url)
}

function bounds(level: Level): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const wall of level.walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x)
    minY = Math.min(minY, wall.a.y, wall.b.y)
    maxX = Math.max(maxX, wall.a.x, wall.b.x)
    maxY = Math.max(maxY, wall.a.y, wall.b.y)
  }
  if (!Number.isFinite(minX)) return { minX: -6, minY: -6, maxX: 6, maxY: 6 }
  return { minX: minX - 2, minY: minY - 2, maxX: maxX + 2, maxY: maxY + 2 }
}

export function renderPlanPng(project: Project, level: Level): string | null {
  if (typeof document === 'undefined') return null
  const box = bounds(level)
  const worldW = Math.max(1, box.maxX - box.minX)
  const worldH = Math.max(1, box.maxY - box.minY)
  const width = 4000
  const height = Math.min(4000, Math.max(1800, Math.round(width * (worldH / worldW))))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) return null
  ctx2d.fillStyle = '#f4f0e6'
  ctx2d.fillRect(0, 0, width, height)
  const zoom = Math.min(width / (worldW * PX), height / (worldH * PX))
  const camX = (box.minX + box.maxX) / 2
  const camY = (box.minY + box.maxY) / 2
  const worldToScreen = (p: { x: number; y: number }) => ({
    x: (p.x - camX) * PX * zoom + width / 2,
    y: height / 2 - (p.y - camY) * PX * zoom,
  })
  const screenToWorld = (x: number, y: number) => ({
    x: camX + (x - width / 2) / (PX * zoom),
    y: camY - (y - height / 2) / (PX * zoom),
  })
  const pointer = {
    raw: { x: 0, y: 0 },
    point: { x: 0, y: 0 },
    screen: { x: 0, y: 0 },
    shift: false,
    alt: false,
    meta: false,
    ctrl: false,
  }
  const ctx: PlanDrawContext = {
    worldToScreen,
    screenToWorld,
    zoom,
    defaultZoom: zoom,
    width,
    height,
    level,
    project,
    selection: [],
    hover: null,
    levelDisplay: 'current',
    toolId: 'select',
    pointer,
    transform: {
      worldToScreen,
      screenToWorld,
      zoom,
      panBy() {},
      zoomAt() {},
      fit() {},
    },
  }
  for (const layer of listPlanLayers()) {
    if (layer.id === 'overlays') continue
    try {
      layer.draw(ctx2d, ctx)
    } catch (err) {
      console.error(err)
    }
  }
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export async function exportPlanPng(): Promise<void> {
  const state = useStore.getState()
  const level = state.project.levels.find((item) => item.id === state.activeLevelId) ?? state.project.levels[0]
  if (!level) {
    state.setMessage('No level to draw')
    return
  }
  const url = renderPlanPng(state.project, level)
  await save(fileName(state.project.name, 'png').replace(/\.png$/, '-plan.png'), url ?? '')
}

export async function exportPlanPdf(): Promise<void> {
  const project = useStore.getState().project
  const pdf = buildPlanPdf(project)
  const bytes = new TextEncoder().encode(pdf)
  await save(fileName(project.name, 'pdf'), bytesToDataUrl(bytes, 'application/pdf'))
}
