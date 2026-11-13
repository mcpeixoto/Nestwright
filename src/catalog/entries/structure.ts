import type { CatalogEntry } from '../types'
import { cylinder, emissiveBox, group, matOf, roundedBox } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

const entries: CatalogEntry[] = [
  {
    id: 'radiator',
    name: 'Radiator',
    category: 'structure',
    tags: ['heat'],
    defaultSize: { w: 1.0, d: 0.12, h: 0.6 },
    price: 180,
    materialSlots: { metal: ref('plaster-white') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const metal = matOf(ctx, 'metal')
      roundedBox(g, metal, 'metal', w, h * 0.08, d, 0, h * 0.08, 0, 0.004)
      roundedBox(g, metal, 'metal', w, h * 0.08, d, 0, h * 0.92, 0, 0.004)
      const cols = 8
      for (let i = 0; i < cols; i++) {
        const x = -w / 2 + w * ((i + 0.5) / cols)
        cylinder(g, metal, 'metal', Math.min(0.03, w / 20), h * 0.78, x, h * 0.5, 0, 'y', 8)
      }
      return g
    },
  },
  {
    id: 'air-conditioner',
    name: 'Air conditioner',
    category: 'structure',
    tags: ['climate'],
    defaultSize: { w: 0.8, d: 0.22, h: 0.3 },
    price: 420,
    mount: 'wall',
    mountHeight: 2.05,
    materialSlots: { body: ref('plaster-white') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.008)
      roundedBox(g, matOf(ctx, 'body'), 'body', w * 0.7, h * 0.18, 0.012, 0, h * 0.35, d / 2 - 0.008, 0)
      return g
    },
  },
  {
    id: 'wood-stove',
    name: 'Wood stove',
    category: 'structure',
    tags: ['heat', 'light'],
    defaultSize: { w: 0.5, d: 0.48, h: 0.8 },
    price: 890,
    materialSlots: { body: ref('metal-black'), glass: ref('glass') },
    light: { color: '#ff9340', intensity: 10, distance: 3.5, offsetY: 0.35 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const body = matOf(ctx, 'body')
      roundedBox(g, body, 'body', w, h * 0.7, d, 0, h * 0.42, 0, 0.012)
      roundedBox(g, body, 'body', w * 0.35, h * 0.22, d * 0.35, 0, h * 0.86, 0, 0.006)
      emissiveBox(g, '#ff7a2e', 'glass', w * 0.4, h * 0.28, 0.012, 0, h * 0.4, d / 2 - 0.01)
      return g
    },
  },
  {
    id: 'fireplace-insert',
    name: 'Fireplace insert',
    category: 'structure',
    tags: ['heat', 'light'],
    defaultSize: { w: 0.8, d: 0.45, h: 0.6 },
    price: 720,
    materialSlots: { frame: ref('metal-black'), fire: ref('paint-terracotta') },
    light: { color: '#ff8c3a', intensity: 12, distance: 4, offsetY: 0.22 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'frame'), 'frame', w, h, d, 0, h / 2, 0, 0.008)
      emissiveBox(g, '#ff7a33', 'fire', w * 0.7, h * 0.45, d * 0.15, 0, h * 0.4, d * 0.28)
      return g
    },
  },
]

registerEntries(entries)
