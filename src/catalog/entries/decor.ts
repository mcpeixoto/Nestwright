import * as THREE from 'three'
import type { CatalogEntry } from '../types'
import { clamp, cylinder, group, lathe, matOf, paramNum, roundedBox } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

function abstractCanvas(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 160
  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) return null
  ctx2d.fillStyle = '#efe6d4'
  ctx2d.fillRect(0, 0, 128, 160)
  const inks = ['#3d6b66', '#c47a5a', '#243044', '#e8b86d']
  for (let i = 0; i < 7; i++) {
    ctx2d.fillStyle = inks[i % inks.length] ?? '#3d6b66'
    ctx2d.globalAlpha = 0.85
    ctx2d.beginPath()
    ctx2d.ellipse(20 + ((i * 37) % 90), 24 + i * 18, 18 + (i % 3) * 6, 10 + (i % 4) * 4, i, 0, Math.PI * 2)
    ctx2d.fill()
  }
  ctx2d.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const entries: CatalogEntry[] = [
  {
    id: 'wall-art',
    name: 'Framed print',
    category: 'decor',
    tags: ['art'],
    defaultSize: { w: 0.7, d: 0.04, h: 0.9 },
    price: 85,
    mount: 'wall',
    mountHeight: 1.35,
    materialSlots: { frame: ref('walnut-planks'), canvas: ref('plaster-warm') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'frame'), 'frame', w, h, d, 0, h / 2, 0, 0.004)
      const map = abstractCanvas()
      const source = matOf(ctx, 'canvas')
      const material = (source instanceof THREE.MeshStandardMaterial ? source : new THREE.MeshStandardMaterial({ color: '#efe6d4' })).clone()
      material.userData.owned = true
      if (map) {
        material.map = map
        map.userData = { owned: true }
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, h * 0.82, Math.max(0.004, d * 0.3)), material)
      mesh.position.set(0, h / 2, d * 0.15)
      mesh.userData.slot = 'canvas'
      mesh.castShadow = true
      g.add(mesh)
      return g
    },
  },
  {
    id: 'mirror-round',
    name: 'Round mirror',
    category: 'decor',
    tags: ['mirror'],
    defaultSize: { w: 0.7, d: 0.04, h: 0.7 },
    price: 110,
    mount: 'wall',
    mountHeight: 1.4,
    materialSlots: { frame: ref('metal-brass'), glass: ref('mirror') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = cylinder(g, matOf(ctx, 'frame'), 'frame', 0.5, d, 0, h / 2, 0, 'z', 24)
      frame.scale.set(w, h, 1)
      const glass = cylinder(g, matOf(ctx, 'glass'), 'glass', 0.42, d * 0.4, 0, h / 2, d * 0.2, 'z', 24)
      glass.scale.set(w, h, 1)
      return g
    },
  },
  {
    id: 'curtains',
    name: 'Pleated curtains',
    category: 'decor',
    tags: ['window'],
    defaultSize: { w: 1.6, d: 0.12, h: 2.3 },
    price: 180,
    mount: 'ceiling',
    materialSlots: { fabric: ref('fabric-linen'), rail: ref('metal-black') },
    params: [{ key: 'open', label: 'Open', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.7 }],
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const open = clamp(paramNum(ctx.params, 'open', 0.7), 0, 1)
      const fabric = matOf(ctx, 'fabric')
      roundedBox(g, matOf(ctx, 'rail'), 'rail', w, h * 0.03, d, 0, h - h * 0.015, 0, 0.002)
      const panelW = clamp((w * 0.5) * (1 - open * 0.65), w * 0.08, w * 0.5)
      const pleats = 4
      const pleatW = (panelW / pleats) * 0.7
      for (const side of [-1, 1]) {
        for (let i = 0; i < pleats; i++) {
          const local = (i / (pleats - 1) - 0.5) * panelW
          const x = side * (w / 2 - panelW / 2) + side * local * 0.5 + local
          roundedBox(g, fabric, 'fabric', pleatW, h * 0.96, d * 0.7, clamp(x, -w / 2 + pleatW / 2, w / 2 - pleatW / 2), h * 0.48, 0, 0.004)
        }
      }
      return g
    },
  },
  {
    id: 'blinds',
    name: 'Blinds',
    category: 'decor',
    tags: ['window'],
    defaultSize: { w: 1.2, d: 0.06, h: 1.6 },
    price: 95,
    mount: 'ceiling',
    materialSlots: { slat: ref('plaster-warm') },
    params: [{ key: 'open', label: 'Open', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.2 }],
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const slat = matOf(ctx, 'slat')
      const open = clamp(paramNum(ctx.params, 'open', 0.2), 0, 1)
      roundedBox(g, slat, 'slat', w, h * 0.04, d, 0, h - h * 0.02, 0, 0.002)
      roundedBox(g, slat, 'slat', 0.015, h, d * 0.6, -w / 2 + 0.01, h / 2, 0, 0)
      roundedBox(g, slat, 'slat', 0.015, h, d * 0.6, w / 2 - 0.01, h / 2, 0, 0)
      const span = h * (1 - open * 0.85)
      const count = 10
      for (let i = 0; i < count; i++) {
        const y = h - h * 0.06 - (i * span) / count
        if (y < 0.02) continue
        roundedBox(g, slat, 'slat', w * 0.92, Math.max(0.008, h * 0.012), d * 0.7, 0, y, 0, 0)
      }
      return g
    },
  },
  {
    id: 'books',
    name: 'Stack of books',
    category: 'decor',
    tags: ['books'],
    defaultSize: { w: 0.28, d: 0.22, h: 0.18 },
    price: 24,
    materialSlots: { cover: ref('paint-navy'), page: ref('plaster-warm') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const colours = [matOf(ctx, 'cover'), matOf(ctx, 'page')]
      const n = 4
      const bh = h / n
      for (let i = 0; i < n; i++) {
        roundedBox(g, colours[i % 2] ?? colours[0]!, i % 2 === 0 ? 'cover' : 'page', w * (0.92 + (i % 2) * 0.08), bh * 0.92, d * (0.9 + (i % 3) * 0.03), 0, bh * (i + 0.5), 0, 0.002)
      }
      return g
    },
  },
  {
    id: 'vase',
    name: 'Vase',
    category: 'decor',
    tags: ['decor'],
    defaultSize: { w: 0.22, d: 0.22, h: 0.36 },
    price: 45,
    materialSlots: { ceramic: ref('paint-terracotta') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      lathe(g, matOf(ctx, 'ceramic'), 'ceramic', [
        [0.28, 0],
        [0.42, 0.08],
        [0.38, 0.2],
        [0.22, 0.55],
        [0.3, 0.78],
        [0.36, 1],
      ], w, h, d, 0, 0, 0)
      return g
    },
  },
  {
    id: 'candles',
    name: 'Candles',
    category: 'decor',
    tags: ['light'],
    defaultSize: { w: 0.22, d: 0.12, h: 0.2 },
    price: 18,
    materialSlots: { wax: ref('plaster-warm'), metal: ref('metal-brass') },
    light: { color: '#ffb060', intensity: 4, distance: 1.6, offsetY: 0.16 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'metal'), 'metal', w, h * 0.12, d, 0, h * 0.06, 0, 0.004)
      for (const x of [-w * 0.22, w * 0.18]) {
        const ch = x < 0 ? h * 0.7 : h * 0.5
        cylinder(g, matOf(ctx, 'wax'), 'wax', Math.min(w, d) * 0.16, ch, x, h * 0.12 + ch / 2, 0, 'y', 10)
      }
      return g
    },
  },
  {
    id: 'clock',
    name: 'Clock',
    category: 'decor',
    tags: ['decor'],
    defaultSize: { w: 0.35, d: 0.06, h: 0.35 },
    price: 55,
    materialSlots: { frame: ref('walnut-planks'), face: ref('plaster-white') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = cylinder(g, matOf(ctx, 'frame'), 'frame', 0.5, d, 0, h / 2, 0, 'z', 24)
      frame.scale.set(w, h, 1)
      const face = cylinder(g, matOf(ctx, 'face'), 'face', 0.4, d * 0.35, 0, h / 2, d * 0.25, 'z', 24)
      face.scale.set(w, h, 1)
      return g
    },
  },
  {
    id: 'rug-round',
    name: 'Round rug',
    category: 'decor',
    tags: ['floor'],
    defaultSize: { w: 1.6, d: 1.6, h: 0.02 },
    price: 190,
    materialSlots: { pile: ref('carpet-grey') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const mesh = cylinder(g, matOf(ctx, 'pile'), 'pile', 0.5, h, 0, h / 2, 0, 'y', 28)
      mesh.scale.set(w, 1, d)
      return g
    },
  },
  {
    id: 'rug-runner',
    name: 'Runner rug',
    category: 'decor',
    tags: ['floor'],
    defaultSize: { w: 0.8, d: 2.4, h: 0.015 },
    price: 140,
    materialSlots: { pile: ref('carpet-grey') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'pile'), 'pile', w, h, d, 0, h / 2, 0, 0.004)
      return g
    },
  },
  {
    id: 'cushion',
    name: 'Cushion',
    category: 'decor',
    tags: ['soft'],
    defaultSize: { w: 0.5, d: 0.5, h: 0.16 },
    price: 35,
    materialSlots: { fabric: ref('fabric-linen') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'fabric'), 'fabric', w, h, d, 0, h / 2, 0, Math.min(0.04, h * 0.3))
      return g
    },
  },
  {
    id: 'throw-blanket',
    name: 'Throw blanket',
    category: 'decor',
    tags: ['soft'],
    defaultSize: { w: 1.3, d: 0.9, h: 0.08 },
    price: 55,
    materialSlots: { fabric: ref('fabric-velvet-green') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const fabric = matOf(ctx, 'fabric')
      roundedBox(g, fabric, 'fabric', w, h * 0.45, d, 0, h * 0.22, 0, 0.01)
      roundedBox(g, fabric, 'fabric', w * 0.55, h * 0.55, d * 0.35, w * 0.15, h * 0.55, d * 0.1, 0.012)
      return g
    },
  },
  {
    id: 'shelf-wall',
    name: 'Wall shelf',
    category: 'decor',
    tags: ['storage'],
    defaultSize: { w: 0.9, d: 0.22, h: 0.08 },
    price: 40,
    mount: 'wall',
    mountHeight: 1.4,
    materialSlots: { wood: ref('oak-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'wood'), 'wood', w, h, d, 0, h / 2, 0, 0.004)
      return g
    },
  },
]

registerEntries(entries)
