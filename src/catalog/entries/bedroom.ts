import type { CatalogEntry } from '../types'
import { clamp, cylinder, fourLegs, glassPane, group, matOf, roundedBox } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

function bedLike(ctx: Parameters<CatalogEntry['build']>[0], pillows: number): ReturnType<typeof group> {
  const { w, d, h } = ctx.size
  const g = group()
  const linen = matOf(ctx, 'linen')
  const frame = matOf(ctx, 'frame')
  const baseH = clamp(h * 0.28, 0.12, 0.32)
  roundedBox(g, frame, 'frame', w, baseH, d, 0, baseH / 2, 0, 0.01)
  const mattH = clamp((h - baseH) * 0.35, 0.08, 0.24)
  roundedBox(g, linen, 'linen', w * 0.96, mattH, d * 0.9, 0, baseH + mattH / 2, d * 0.02, 0.02)
  roundedBox(g, frame, 'frame', w, h - baseH, d * 0.08, 0, baseH + (h - baseH) / 2, -d / 2 + d * 0.04, 0.01)
  const pw = w / (pillows + 0.4)
  for (let i = 0; i < pillows; i++) {
    const x = -w * 0.32 + (i * w * 0.64) / Math.max(1, pillows - 1)
    roundedBox(g, linen, 'linen', pw * 0.8, mattH * 0.55, d * 0.14, pillows === 1 ? 0 : x, baseH + mattH + mattH * 0.2, -d * 0.28, 0.016)
  }
  return g
}

const entries: CatalogEntry[] = [
  {
    id: 'bed-king',
    name: 'King bed',
    category: 'bedroom',
    tags: ['sleep'],
    defaultSize: { w: 1.9, d: 2.15, h: 1.1 },
    price: 1280,
    materialSlots: { linen: ref('fabric-linen'), frame: ref('walnut-planks') },
    build: (ctx) => bedLike(ctx, 2),
  },
  {
    id: 'bunk-bed',
    name: 'Bunk bed',
    category: 'bedroom',
    tags: ['sleep'],
    defaultSize: { w: 1.05, d: 2.05, h: 1.8 },
    price: 890,
    materialSlots: { linen: ref('fabric-linen'), frame: ref('oak-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      const linen = matOf(ctx, 'linen')
      const post = 0.05
      for (const x of [-w / 2 + post / 2, w / 2 - post / 2]) {
        for (const z of [-d / 2 + post / 2, d / 2 - post / 2]) {
          roundedBox(g, frame, 'frame', post, h, post, x, h / 2, z, 0.004)
        }
      }
      roundedBox(g, linen, 'linen', w * 0.86, h * 0.08, d * 0.86, 0, h * 0.22, 0, 0.012)
      roundedBox(g, linen, 'linen', w * 0.86, h * 0.08, d * 0.86, 0, h * 0.68, 0, 0.012)
      const ladderW = Math.min(w * 0.42, Math.max(0.08, w - post * 3))
      roundedBox(g, frame, 'frame', ladderW, h * 0.35, 0.04, w / 2 - post - ladderW / 2, h * 0.4, Math.min(d * 0.2, d / 2 - 0.04), 0.004)
      return g
    },
  },
  {
    id: 'crib',
    name: 'Crib',
    category: 'bedroom',
    tags: ['sleep'],
    defaultSize: { w: 0.7, d: 1.3, h: 0.9 },
    price: 340,
    materialSlots: { linen: ref('fabric-linen'), frame: ref('oak-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      const linen = matOf(ctx, 'linen')
      fourLegs(g, frame, 'frame', w, d, h, 0.02)
      roundedBox(g, linen, 'linen', w * 0.86, h * 0.12, d * 0.86, 0, h * 0.28, 0, 0.012)
      roundedBox(g, frame, 'frame', w, h * 0.55, 0.02, 0, h * 0.62, -d / 2 + 0.02, 0)
      roundedBox(g, frame, 'frame', w, h * 0.55, 0.02, 0, h * 0.62, d / 2 - 0.02, 0)
      roundedBox(g, frame, 'frame', 0.02, h * 0.45, d, -w / 2 + 0.02, h * 0.55, 0, 0)
      roundedBox(g, frame, 'frame', 0.02, h * 0.45, d, w / 2 - 0.02, h * 0.55, 0, 0)
      return g
    },
  },
  {
    id: 'dresser',
    name: 'Dresser',
    category: 'bedroom',
    tags: ['storage'],
    defaultSize: { w: 1.0, d: 0.48, h: 0.9 },
    price: 480,
    materialSlots: { body: ref('oak-planks'), metal: ref('metal-brass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.008)
      for (let i = 0; i < 3; i++) {
        cylinder(g, matOf(ctx, 'metal'), 'metal', 0.012, w * 0.18, 0, h * (0.28 + i * 0.22), d / 2 - 0.01, 'x', 8)
      }
      return g
    },
  },
  {
    id: 'vanity',
    name: 'Vanity',
    category: 'bedroom',
    tags: ['storage'],
    defaultSize: { w: 1.05, d: 0.45, h: 1.35 },
    price: 620,
    materialSlots: { body: ref('walnut-planks'), glass: ref('glass'), metal: ref('metal-brass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const body = matOf(ctx, 'body')
      roundedBox(g, body, 'body', w, h * 0.55, d, 0, h * 0.28, 0, 0.008)
      roundedBox(g, body, 'body', w * 0.7, h * 0.42, 0.04, 0, h * 0.76, -d / 2 + 0.04, 0.004)
      glassPane(g, matOf(ctx, 'glass'), 'glass', w * 0.55, h * 0.32, 0.015, 0, h * 0.76, -d / 2 + 0.055)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.01, w * 0.16, 0, h * 0.32, d / 2 - 0.01, 'x', 8)
      return g
    },
  },
  {
    id: 'mirror-standing',
    name: 'Standing mirror',
    category: 'bedroom',
    tags: ['mirror'],
    defaultSize: { w: 0.55, d: 0.4, h: 1.65 },
    price: 210,
    materialSlots: { frame: ref('oak-planks'), glass: ref('mirror') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      roundedBox(g, frame, 'frame', w, 0.04, d, 0, 0.02, 0, 0.004)
      roundedBox(g, frame, 'frame', w * 0.9, h * 0.82, 0.04, 0, h * 0.5, 0, 0.006)
      glassPane(g, matOf(ctx, 'glass'), 'glass', w * 0.72, h * 0.7, 0.012, 0, h * 0.52, 0.02, 0.55)
      return g
    },
  },
  {
    id: 'wardrobe-sliding',
    name: 'Sliding wardrobe',
    category: 'bedroom',
    tags: ['storage'],
    defaultSize: { w: 1.8, d: 0.65, h: 2.2 },
    price: 1100,
    materialSlots: { body: ref('oak-planks'), metal: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.008)
      roundedBox(g, matOf(ctx, 'metal'), 'metal', 0.012, h * 0.7, 0.016, 0, h * 0.5, d / 2 - 0.01, 0)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.012, h * 0.18, -w * 0.12, h * 0.55, d / 2 - 0.012, 'y', 8)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.012, h * 0.18, w * 0.12, h * 0.55, d / 2 - 0.012, 'y', 8)
      return g
    },
  },
  {
    id: 'ottoman',
    name: 'Ottoman',
    category: 'bedroom',
    tags: ['seat', 'storage'],
    defaultSize: { w: 0.7, d: 0.5, h: 0.42 },
    price: 190,
    materialSlots: { fabric: ref('boucle'), legs: ref('walnut-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const legH = clamp(h * 0.22, 0.05, 0.1)
      fourLegs(g, matOf(ctx, 'legs'), 'legs', w, d, legH, 0.02)
      roundedBox(g, matOf(ctx, 'fabric'), 'fabric', w, h - legH, d, 0, legH + (h - legH) / 2, 0, 0.02)
      return g
    },
  },
]

registerEntries(entries)
