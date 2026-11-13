import type { CatalogEntry } from '../types'
import { cylinder, glassPane, group, matOf, roundedBox, torusRing } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

const entries: CatalogEntry[] = [
  {
    id: 'double-washbasin',
    name: 'Double washbasin',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 1.2, d: 0.48, h: 0.85 },
    price: 640,
    materialSlots: { vanity: ref('oak-planks'), basin: ref('plaster-white'), tap: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'vanity'), 'vanity', w, h * 0.72, d, 0, h * 0.36, 0, 0.01)
      for (const x of [-w * 0.24, w * 0.24]) {
        roundedBox(g, matOf(ctx, 'basin'), 'basin', w * 0.32, 0.08, d * 0.5, x, h * 0.78, 0, 0.02)
        cylinder(g, matOf(ctx, 'tap'), 'tap', 0.012, h * 0.16, x, h * 0.9, -d * 0.12, 'y', 8)
        roundedBox(g, matOf(ctx, 'tap'), 'tap', 0.08, 0.016, 0.02, x, h * 0.96, -d * 0.04, 0)
      }
      return g
    },
  },
  {
    id: 'freestanding-tub',
    name: 'Freestanding tub',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 1.7, d: 0.8, h: 0.6 },
    price: 980,
    materialSlots: { shell: ref('plaster-white'), metal: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const shell = matOf(ctx, 'shell')
      roundedBox(g, shell, 'shell', w, h * 0.72, d, 0, h * 0.4, 0, Math.min(0.12, d * 0.2))
      roundedBox(g, shell, 'shell', w * 0.82, h * 0.18, d * 0.62, 0, h * 0.62, 0, 0.04)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.015, h * 0.28, 0, h * 0.78, -d * 0.1, 'y', 8)
      return g
    },
  },
  {
    id: 'walk-in-shower',
    name: 'Walk-in shower',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 1.1, d: 1.1, h: 2.1 },
    price: 890,
    materialSlots: { tray: ref('tile-white'), frame: ref('chrome'), glass: ref('glass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      roundedBox(g, matOf(ctx, 'tray'), 'tray', w, 0.08, d, 0, 0.04, 0, 0.008)
      roundedBox(g, frame, 'frame', 0.04, h - 0.08, 0.04, -w / 2 + 0.02, h / 2, d / 2 - 0.02, 0)
      roundedBox(g, frame, 'frame', 0.04, h - 0.08, 0.04, w / 2 - 0.02, h / 2, -d / 2 + 0.02, 0)
      glassPane(g, matOf(ctx, 'glass'), 'glass', w - 0.08, h * 0.86, 0.012, 0, h * 0.5, d / 2 - 0.02)
      glassPane(g, matOf(ctx, 'glass'), 'glass', 0.012, h * 0.86, d * 0.55, -w / 2 + 0.02, h * 0.5, -d * 0.1)
      cylinder(g, frame, 'frame', 0.03, 0.02, 0, h - 0.12, -d * 0.15, 'y', 10)
      return g
    },
  },
  {
    id: 'wc-wall-hung',
    name: 'Wall-hung WC',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 0.38, d: 0.56, h: 0.42 },
    price: 320,
    mount: 'wall',
    mountHeight: 0.4,
    materialSlots: { ceramic: ref('plaster-white') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const ceramic = matOf(ctx, 'ceramic')
      roundedBox(g, ceramic, 'ceramic', w, h * 0.55, d * 0.85, 0, h * 0.32, d * 0.04, 0.04)
      roundedBox(g, ceramic, 'ceramic', w * 0.7, h * 0.22, d * 0.35, 0, h * 0.72, -d * 0.2, 0.02)
      return g
    },
  },
  {
    id: 'towel-radiator',
    name: 'Towel radiator',
    category: 'bathroom',
    tags: ['heat'],
    defaultSize: { w: 0.55, d: 0.12, h: 1.2 },
    price: 220,
    mount: 'wall',
    mountHeight: 0.25,
    materialSlots: { metal: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const metal = matOf(ctx, 'metal')
      roundedBox(g, metal, 'metal', 0.03, h, d, -w / 2 + 0.015, h / 2, 0, 0.004)
      roundedBox(g, metal, 'metal', 0.03, h, d, w / 2 - 0.015, h / 2, 0, 0.004)
      for (let i = 0; i < 8; i++) {
        const y = h * (0.08 + i * 0.11)
        cylinder(g, metal, 'metal', 0.01, w - 0.06, 0, y, 0, 'x', 8)
      }
      return g
    },
  },
  {
    id: 'bathroom-cabinet',
    name: 'Bathroom cabinet',
    category: 'bathroom',
    tags: ['storage'],
    defaultSize: { w: 0.6, d: 0.2, h: 0.7 },
    price: 180,
    mount: 'wall',
    mountHeight: 1.35,
    materialSlots: { body: ref('plaster-white'), glass: ref('frosted-glass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.008)
      glassPane(g, matOf(ctx, 'glass'), 'glass', w * 0.42, h * 0.7, 0.01, -w * 0.22, h * 0.5, d / 2 - 0.012, 0.45)
      glassPane(g, matOf(ctx, 'glass'), 'glass', w * 0.42, h * 0.7, 0.01, w * 0.22, h * 0.5, d / 2 - 0.012, 0.45)
      return g
    },
  },
  {
    id: 'washing-machine',
    name: 'Washing machine',
    category: 'bathroom',
    tags: ['appliance'],
    defaultSize: { w: 0.6, d: 0.6, h: 0.85 },
    price: 480,
    materialSlots: { body: ref('plaster-white'), door: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.01)
      torusRing(g, matOf(ctx, 'door'), 'door', Math.min(w, h) * 0.22, 0.015, 0, h * 0.48, d / 2 - 0.01, false)
      roundedBox(g, matOf(ctx, 'door'), 'door', w * 0.7, h * 0.06, 0.015, 0, h * 0.82, d / 2 - 0.012, 0)
      return g
    },
  },
  {
    id: 'dryer',
    name: 'Dryer',
    category: 'bathroom',
    tags: ['appliance'],
    defaultSize: { w: 0.6, d: 0.62, h: 0.85 },
    price: 520,
    materialSlots: { body: ref('plaster-white'), door: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.01)
      torusRing(g, matOf(ctx, 'door'), 'door', Math.min(w, h) * 0.2, 0.016, 0, h * 0.5, d / 2 - 0.01, false)
      roundedBox(g, matOf(ctx, 'door'), 'door', w * 0.2, h * 0.08, 0.02, w * 0.28, h * 0.78, d / 2 - 0.012, 0)
      return g
    },
  },
]

registerEntries(entries)
