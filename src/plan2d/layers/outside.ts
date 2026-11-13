import { polygonArea } from '../../model/geometry'
import { contourLines, decodeSplat, dominantLayer, LAYER_RGB, splatLength } from '../../model/terrain'
import type { Terrain, Vec2 } from '../../model/types'
import { GROUND_LAYERS } from '../../model/types'
import { registerPlanLayer, type PlanDrawContext } from '../layers'

const PLANT_COLOR: Record<string, string> = {
  oak: '#3f6b34',
  birch: '#d7d0c0',
  pine: '#1f4a32',
  cypress: '#24543a',
  palm: '#2f7a40',
  olive: '#8a9360',
  'fruit-tree': '#4e7a3c',
  'bush-round': '#3f6b34',
  'bush-flowering': '#d46a8a',
  'hedge-segment': '#2f6b3c',
  'flowers-mixed': '#e0b43a',
  sunflowers: '#e2b434',
  lavender: '#7a68b0',
  'tall-grass': '#6a8f3e',
  reeds: '#8a9a58',
  'rock-small': '#8a8680',
  'rock-large': '#6e6a64',
}

let splatCache: { key: string; canvas: HTMLCanvasElement } | null = null
let contourCache: { heights: Terrain['heights']; lines: Vec2[][] } | null = null

function splatImage(terrain: Terrain): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const key = `${terrain.resolution}:${terrain.width}:${terrain.depth}:${terrain.splat}`
  if (splatCache?.key === key) return splatCache.canvas
  const n = terrain.resolution + 1
  if (n < 2 || n > 256) return null
  const canvas = document.createElement('canvas')
  canvas.width = n
  canvas.height = n
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const image = ctx.createImageData(n, n)
      const weights = decodeSplat(terrain.splat, splatLength(terrain))
      const samples = Math.floor(weights.length / GROUND_LAYERS.length)
      if (samples <= 0) return null
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const sample = Math.min(iy * n + ix, samples - 1)
          const layer = dominantLayer(weights, sample)
      const rgb = LAYER_RGB[layer] ?? LAYER_RGB[0]!
      const row = n - 1 - iy
      const offset = (row * n + ix) * 4
      image.data[offset] = rgb[0]
      image.data[offset + 1] = rgb[1]
      image.data[offset + 2] = rgb[2]
      image.data[offset + 3] = 150
    }
  }
  ctx.putImageData(image, 0, 0)
  splatCache = { key, canvas }
  return canvas
}

function contours(terrain: Terrain): Vec2[][] {
  if (contourCache?.heights === terrain.heights) return contourCache.lines
  const lines = contourLines(terrain, 0.5)
  contourCache = { heights: terrain.heights, lines }
  return lines
}

function screen(ctx: PlanDrawContext, point: Vec2): { x: number; y: number } {
  return ctx.worldToScreen(point)
}

export function installOutsidePlan(): void {
registerPlanLayer({
  id: 'terrain',
  order: 10,
  draw(ctx2d, ctx) {
    const terrain = ctx.project.terrain
    if (!terrain?.enabled) return
    const image = splatImage(terrain)
    if (image && terrain.width > 0 && terrain.depth > 0) {
      const topLeft = screen(ctx, { x: -terrain.width / 2, y: terrain.depth / 2 })
      const bottomRight = screen(ctx, { x: terrain.width / 2, y: -terrain.depth / 2 })
      ctx2d.drawImage(image, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
    }
    const lines = contours(terrain)
    if (lines.length > 0) {
      ctx2d.save()
      ctx2d.strokeStyle = 'rgba(60, 78, 48, 0.45)'
      ctx2d.lineWidth = 1
      for (const line of lines) {
        if (line.length < 2) continue
        ctx2d.beginPath()
        const first = screen(ctx, line[0]!)
        ctx2d.moveTo(first.x, first.y)
        for (const point of line.slice(1)) {
          const s = screen(ctx, point)
          ctx2d.lineTo(s.x, s.y)
        }
        ctx2d.stroke()
      }
      ctx2d.restore()
    }
    const boundary = terrain.boundary
    if (boundary.length >= 2) {
      ctx2d.save()
      ctx2d.strokeStyle = 'rgba(47, 90, 72, 0.7)'
      ctx2d.fillStyle = '#3FB8AF'
      ctx2d.setLineDash([6, 4])
      ctx2d.lineWidth = 1.25
      ctx2d.beginPath()
      const first = screen(ctx, boundary[0]!)
      ctx2d.moveTo(first.x, first.y)
      for (const point of boundary.slice(1)) {
        const s = screen(ctx, point)
        ctx2d.lineTo(s.x, s.y)
      }
      if (boundary.length >= 3) ctx2d.closePath()
      ctx2d.stroke()
      ctx2d.setLineDash([])
      for (const point of boundary) {
        const s = screen(ctx, point)
        ctx2d.fillRect(s.x - 3, s.y - 3, 6, 6)
      }
      ctx2d.restore()
    }
  },
})

registerPlanLayer({
  id: 'outside',
  order: 12,
  draw(ctx2d, ctx) {
    const terrain = ctx.project.terrain
    if (!terrain) return
    ctx2d.save()
    for (const body of terrain.water) {
      if (!body || body.polygon.length < 2) continue
      const selected = ctx.selection.includes(body.id)
      ctx2d.beginPath()
      const first = screen(ctx, body.polygon[0]!)
      ctx2d.moveTo(first.x, first.y)
      for (const point of body.polygon.slice(1)) {
        const s = screen(ctx, point)
        ctx2d.lineTo(s.x, s.y)
      }
      if (body.kind !== 'stream') ctx2d.closePath()
      ctx2d.fillStyle = selected ? 'rgba(47, 140, 168, 0.45)' : 'rgba(47, 140, 168, 0.28)'
      if (body.kind !== 'stream') ctx2d.fill()
      ctx2d.strokeStyle = '#1f6e86'
      ctx2d.lineWidth = selected ? 2 : 1
      ctx2d.stroke()
    }
    for (const fence of terrain.fences) {
      if (!fence || fence.points.length < 2) continue
      const selected = ctx.selection.includes(fence.id)
      ctx2d.strokeStyle = fence.style === 'hedge' ? '#2f6b3c' : '#6b5344'
      ctx2d.lineWidth = selected ? 3 : 1.5
      ctx2d.beginPath()
      const first = screen(ctx, fence.points[0]!)
      ctx2d.moveTo(first.x, first.y)
      for (const point of fence.points.slice(1)) {
        const s = screen(ctx, point)
        ctx2d.lineTo(s.x, s.y)
      }
      ctx2d.stroke()
      const gates = new Set(fence.gates ?? [])
      ctx2d.strokeStyle = '#E8B86D'
      ctx2d.lineWidth = 2
      for (const index of gates) {
        const a = fence.points[index]
        const b = fence.points[index + 1]
        if (!a || !b) continue
        const sa = screen(ctx, a)
        const sb = screen(ctx, b)
        ctx2d.beginPath()
        ctx2d.moveTo(sa.x, sa.y)
        ctx2d.lineTo(sb.x, sb.y)
        ctx2d.stroke()
      }
    }
    const plants = terrain.plants
    const rough = plants.length > 2500
    for (const plant of plants) {
      if (!plant) continue
      const s = screen(ctx, plant.position)
      const radius = Math.max(1.5, (plant.species.includes('rock') ? 3 : plant.species.startsWith('bush') ? 4 : 6) * Math.max(0.4, plant.scale) * Math.min(ctx.zoom, 2))
      ctx2d.fillStyle = PLANT_COLOR[plant.species] ?? '#3f6b34'
      if (ctx.selection.includes(plant.id)) ctx2d.fillStyle = '#3FB8AF'
      ctx2d.globalAlpha = 0.9
      if (rough) {
        ctx2d.fillRect(s.x - 1, s.y - 1, 2, 2)
      } else {
        ctx2d.beginPath()
        ctx2d.arc(s.x, s.y, radius, 0, Math.PI * 2)
        ctx2d.fill()
      }
    }
    ctx2d.globalAlpha = 1
    const level = ctx.level
    if (level) {
      ctx2d.strokeStyle = 'rgba(47, 107, 69, 0.85)'
      for (const wall of level.walls) {
        const cover = Math.max(wall.ivy?.left ?? 0, wall.ivy?.right ?? 0)
        if (cover <= 0.02) continue
        const a = screen(ctx, wall.a)
        const b = screen(ctx, wall.b)
        ctx2d.globalAlpha = 0.25 + cover * 0.65
        ctx2d.lineWidth = 2 + cover * 4
        ctx2d.beginPath()
        ctx2d.moveTo(a.x, a.y)
        ctx2d.lineTo(b.x, b.y)
        ctx2d.stroke()
      }
    }
    ctx2d.restore()
    if (ctx.toolId === 'plot-boundary' && terrain.boundary.length >= 3) {
      const area = Math.abs(polygonArea(terrain.boundary))
      const label = screen(ctx, terrain.boundary[0]!)
      ctx2d.save()
      ctx2d.fillStyle = '#1b2422'
      ctx2d.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx2d.fillText(`${area.toFixed(1)} m²`, label.x + 8, label.y - 8)
      ctx2d.restore()
    }
  },
})
}
