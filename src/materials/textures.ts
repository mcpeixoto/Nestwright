import * as THREE from 'three'
import { getMaterialDef, type MaterialDef, type PatternSpec } from './library'

export interface PatternTextures {
  color: THREE.CanvasTexture
  rough: THREE.CanvasTexture
}

const cache = new Map<string, PatternTextures | null>()

type Paint = OffscreenCanvas | HTMLCanvasElement

function makeCanvas(size: number): Paint | null {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    return canvas
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      return new OffscreenCanvas(size, size)
    } catch {
      return null
    }
  }
  return null
}

function context(canvas: Paint): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  } catch {
    return null
  }
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function drawPattern(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, def: MaterialDef, size: number, rough: boolean) {
  const base = rough ? '#808080' : def.color
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const spec: PatternSpec = def.pattern
  const alt = spec.colors ?? [def.color]
  const ink = (i: number) => (rough ? (hash(i + 3) > 0.5 ? '#9a9a9a' : '#5a5a5a') : (alt[i % alt.length] ?? def.color))
  if (spec.kind === 'none') return
  if (spec.kind === 'noise') {
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = ink(i)
      ctx.globalAlpha = rough ? 0.35 : 0.18
      ctx.fillRect(hash(i) * size, hash(i + 19) * size, 2 + hash(i + 4) * 6, 2 + hash(i + 8) * 6)
    }
    ctx.globalAlpha = 1
    return
  }
  if (spec.kind === 'planks' || spec.kind === 'herringbone') {
    const plank = spec.kind === 'herringbone' ? size / 8 : size / 6
    ctx.globalAlpha = 1
    if (spec.kind === 'planks') {
      for (let x = 0; x < size; x += plank) {
        ctx.fillStyle = ink(Math.round(x))
        ctx.fillRect(x, 0, plank - 2, size)
        ctx.strokeStyle = rough ? '#3a3a3a' : 'rgba(0,0,0,0.18)'
        ctx.strokeRect(x, 0, plank - 2, size)
      }
    } else {
      const w = size / 7
      for (let y = -size; y < size * 2; y += w) {
        for (let x = -size; x < size * 2; x += w * 2) {
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(Math.PI / 4)
          ctx.fillStyle = ink(x + y)
          ctx.fillRect(0, 0, w * 1.4, w * 0.45)
          ctx.restore()
        }
      }
    }
    return
  }
  if (spec.kind === 'bricks') {
    const bw = size / 6
    const bh = size / 14
    for (let row = 0; row < 16; row++) {
      const off = row % 2 === 0 ? 0 : bw / 2
      for (let col = -1; col < 8; col++) {
        ctx.fillStyle = ink(row * 8 + col)
        ctx.fillRect(col * bw + off + 1, row * bh + 1, bw - 3, bh - 3)
      }
    }
    return
  }
  if (spec.kind === 'tiles') {
    const n = 4
    const s = size / n
    const grout = rough ? '#6a6a6a' : (spec.grout ?? '#cccccc')
    ctx.fillStyle = grout
    ctx.fillRect(0, 0, size, size)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = ink(x + y * 3)
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4)
      }
    }
    return
  }
  if (spec.kind === 'courses') {
    const rows = 4
    const bh = size / rows
    const bw = size / 6
    const gap = Math.max(8, Math.round(bh * 0.16))
    if (rough) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = '#f0f0f0'
      for (let row = 0; row < rows; row++) ctx.fillRect(0, row * bh, size, gap)
      return
    }
    const grout = spec.grout ?? '#6a3428'
    ctx.fillStyle = grout
    ctx.fillRect(0, 0, size, size)
    for (let row = 0; row < rows; row++) {
      const off = row % 2 === 0 ? 0 : bw / 2
      for (let col = -1; col < 10; col++) {
        ctx.fillStyle = ink(row * 3 + col)
        ctx.fillRect(col * bw + off + 2, row * bh + gap, bw - 4, bh - gap * 1.4)
      }
    }
    return
  }
  if (spec.kind === 'hex') {
    const r = size / 9
    const grout = rough ? '#666' : (spec.grout ?? '#bbb')
    ctx.fillStyle = grout
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = ink(1)
    for (let row = -1; row < 12; row++) {
      for (let col = -1; col < 12; col++) {
        const cx = col * r * 1.75 + (row % 2) * r * 0.875
        const cy = row * r * 1.52
        ctx.beginPath()
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6
          const px = cx + Math.cos(a) * (r - 2)
          const py = cy + Math.sin(a) * (r - 2)
          if (k === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
      }
    }
    return
  }
  if (spec.kind === 'terrazzo') {
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = ink(i)
      ctx.globalAlpha = rough ? 0.7 : 0.9
      ctx.beginPath()
      ctx.ellipse(hash(i) * size, hash(i + 5) * size, 4 + hash(i + 2) * 18, 3 + hash(i + 9) * 12, hash(i) * 6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    return
  }
  if (spec.kind === 'marble') {
    ctx.strokeStyle = rough ? '#9a9a9a' : (alt[1] ?? '#cfc4b4')
    ctx.lineWidth = rough ? 2 : 3
    ctx.globalAlpha = 0.85
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      ctx.moveTo(hash(i) * size, 0)
      ctx.bezierCurveTo(hash(i + 2) * size, size * 0.3, hash(i + 4) * size, size * 0.6, hash(i + 6) * size, size)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    return
  }
  if (spec.kind === 'stripes') {
    const band = size / 10
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = ink(i)
      ctx.fillRect(0, i * band, size, band - 2)
    }
    return
  }
  if (spec.kind === 'checker') {
    const n = 8
    const s = size / n
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = ink((x + y) % 2)
        ctx.fillRect(x * s, y * s, s, s)
      }
    }
    return
  }
  if (spec.kind === 'floral') {
    for (let i = 0; i < 18; i++) {
      const cx = hash(i) * size
      const cy = hash(i + 4) * size
      const petal = 8 + hash(i + 2) * 16
      ctx.fillStyle = ink(i + 1)
      ctx.globalAlpha = rough ? 0.45 : 0.9
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        ctx.beginPath()
        ctx.ellipse(cx + Math.cos(a) * petal * 0.45, cy + Math.sin(a) * petal * 0.45, petal * 0.45, petal * 0.22, a, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    return
  }
  if (spec.kind === 'weave') {
    ctx.globalAlpha = 1
    const step = size / 14
    for (let i = 0; i < 16; i++) {
      ctx.strokeStyle = ink(i)
      ctx.lineWidth = rough ? 3 : 4
      ctx.beginPath()
      ctx.moveTo(0, i * step)
      ctx.bezierCurveTo(size * 0.3, i * step + 6, size * 0.7, i * step - 6, size, i * step)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(i * step, 0)
      ctx.bezierCurveTo(i * step + 6, size * 0.3, i * step - 6, size * 0.7, i * step, size)
      ctx.stroke()
    }
    return
  }
  if (spec.kind === 'fabric') {
    ctx.globalAlpha = rough ? 0.5 : 0.35
    for (let i = 0; i < size; i += 4) {
      ctx.strokeStyle = ink(i)
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(size, i)
      ctx.moveTo(i, 0)
      ctx.lineTo(i, size)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}

function toTexture(canvas: Paint, colorSpace: THREE.ColorSpace): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = colorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex as THREE.CanvasTexture
}

/** Null when no canvas exists (unit tests, headless). Callers fall back to a flat colour. */
export function getPatternTextures(id: string): PatternTextures | null {
  if (cache.has(id)) return cache.get(id) ?? null
  const def = getMaterialDef(id)
  if (!def || def.pattern.kind === 'none') {
    cache.set(id, null)
    return null
  }
  const colorCanvas = makeCanvas(512)
  const roughCanvas = makeCanvas(512)
  if (!colorCanvas || !roughCanvas) {
    cache.set(id, null)
    return null
  }
  const colorCtx = context(colorCanvas)
  const roughCtx = context(roughCanvas)
  if (!colorCtx || !roughCtx) {
    cache.set(id, null)
    return null
  }
  try {
    drawPattern(colorCtx, def, 512, false)
    drawPattern(roughCtx, def, 512, true)
    const textures = {
      color: toTexture(colorCanvas, THREE.SRGBColorSpace),
      rough: toTexture(roughCanvas, THREE.NoColorSpace),
    }
    cache.set(id, textures)
    return textures
  } catch {
    cache.set(id, null)
    return null
  }
}
