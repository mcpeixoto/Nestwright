import type { BuildContext, CatalogEntry } from '../types'
import {
  clamp,
  cushion,
  cylinder,
  ellipsoid,
  emissiveBox,
  fourLegs,
  group,
  matOf,
  roundedBox,
} from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

function sofa(ctx: BuildContext, seats: number, chaise: boolean): ReturnType<typeof group> {
  const { w, d, h } = ctx.size
  const g = group()
  const fabric = matOf(ctx, 'fabric')
  const legs = matOf(ctx, 'legs')
  const legH = clamp(h * 0.12, 0.05, 0.1)
  const arm = clamp(w * 0.08, 0.06, 0.12)
  const backT = clamp(d * 0.18, 0.1, 0.18)
  fourLegs(g, legs, 'legs', w, d, legH, 0.028)
  const seatD = chaise ? d * 0.62 : d - 0.02
  cushion(g, fabric, 'fabric', w - arm * 2, h * 0.22, seatD * 0.78, 0, legH + h * 0.16, d * 0.06)
  roundedBox(g, fabric, 'fabric', w, h - legH, backT, 0, legH + (h - legH) / 2, -d / 2 + backT / 2, 0.02)
  roundedBox(g, fabric, 'fabric', arm, h - legH, d, -w / 2 + arm / 2, legH + (h - legH) / 2, 0, 0.016)
  roundedBox(g, fabric, 'fabric', arm, h - legH, d, w / 2 - arm / 2, legH + (h - legH) / 2, 0, 0.016)
  const gap = (w - arm * 2) / seats
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + arm + gap * (i + 0.5)
    cushion(g, fabric, 'fabric', gap * 0.88, h * 0.16, d * 0.42, x, legH + h * 0.28, d * 0.02)
  }
  if (chaise) {
    roundedBox(g, fabric, 'fabric', w * 0.42, h * 0.28, d * 0.38, w * 0.22, legH + h * 0.16, d * 0.28, 0.02)
  }
  return g
}

const entries: CatalogEntry[] = [
  {
    id: 'sofa-2',
    name: 'Two-seat sofa',
    category: 'living',
    tags: ['seat', 'lounge'],
    defaultSize: { w: 1.6, d: 0.9, h: 0.82 },
    price: 740,
    materialSlots: { fabric: ref('fabric-linen'), legs: ref('walnut-planks') },
    build: (ctx) => sofa(ctx, 2, false),
  },
  {
    id: 'sofa-corner',
    name: 'Corner sofa',
    category: 'living',
    tags: ['seat', 'lounge'],
    defaultSize: { w: 2.4, d: 1.7, h: 0.82 },
    price: 1480,
    materialSlots: { fabric: ref('fabric-velvet-green'), legs: ref('walnut-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const fabric = matOf(ctx, 'fabric')
      const legs = matOf(ctx, 'legs')
      const legH = clamp(h * 0.1, 0.05, 0.1)
      const arm = clamp(Math.min(w, d) * 0.12, 0.1, 0.16)
      fourLegs(g, legs, 'legs', w, d, legH, 0.028)
      roundedBox(g, fabric, 'fabric', w, h * 0.22, arm, 0, legH + h * 0.14, -d / 2 + arm / 2, 0.02)
      roundedBox(g, fabric, 'fabric', arm, h * 0.22, d, -w / 2 + arm / 2, legH + h * 0.14, 0, 0.02)
      roundedBox(g, fabric, 'fabric', w, h - legH, arm * 0.7, 0, legH + (h - legH) / 2, -d / 2 + arm * 0.35, 0.016)
      roundedBox(g, fabric, 'fabric', arm * 0.7, h - legH, d, -w / 2 + arm * 0.35, legH + (h - legH) / 2, 0, 0.016)
      roundedBox(g, fabric, 'fabric', arm, h - legH, arm, w / 2 - arm / 2, legH + (h - legH) / 2, d / 2 - arm / 2, 0.016)
      cushion(g, fabric, 'fabric', w * 0.55, h * 0.14, arm * 0.7, w * 0.12, legH + h * 0.3, -d / 2 + arm * 0.7)
      cushion(g, fabric, 'fabric', arm * 0.7, h * 0.14, d * 0.5, -w / 2 + arm * 0.7, legH + h * 0.3, d * 0.08)
      return g
    },
  },
  {
    id: 'sofa-modular',
    name: 'Modular sofa',
    category: 'living',
    tags: ['seat', 'lounge'],
    defaultSize: { w: 2.4, d: 0.95, h: 0.78 },
    price: 1320,
    materialSlots: { fabric: ref('boucle'), legs: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const fabric = matOf(ctx, 'fabric')
      const legs = matOf(ctx, 'legs')
      const n = 3
      const gap = 0.03
      const mw = (w - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + mw / 2 + i * (mw + gap)
        roundedBox(g, fabric, 'fabric', mw, h * 0.42, d * 0.92, x, h * 0.28, 0, 0.02)
        roundedBox(g, fabric, 'fabric', mw * 0.92, h * 0.48, d * 0.16, x, h * 0.68, -d / 2 + d * 0.12, 0.016)
        cylinder(g, legs, 'legs', 0.02, h * 0.12, x - mw * 0.32, h * 0.06, d * 0.32, 'y', 8)
        cylinder(g, legs, 'legs', 0.02, h * 0.12, x + mw * 0.32, h * 0.06, -d * 0.32, 'y', 8)
      }
      return g
    },
  },
  {
    id: 'chaise',
    name: 'Chaise longue',
    category: 'living',
    tags: ['seat', 'lounge'],
    defaultSize: { w: 1.7, d: 0.8, h: 0.78 },
    price: 690,
    materialSlots: { fabric: ref('velvet-rust'), legs: ref('walnut-planks') },
    build: (ctx) => sofa(ctx, 1, true),
  },
  {
    id: 'armchair-wingback',
    name: 'Wingback chair',
    category: 'living',
    tags: ['seat'],
    defaultSize: { w: 0.78, d: 0.84, h: 1.08 },
    price: 540,
    materialSlots: { fabric: ref('velvet-rust'), legs: ref('walnut-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const fabric = matOf(ctx, 'fabric')
      const legs = matOf(ctx, 'legs')
      const legH = clamp(h * 0.14, 0.08, 0.16)
      fourLegs(g, legs, 'legs', w, d, legH, 0.026)
      roundedBox(g, fabric, 'fabric', w * 0.86, h * 0.12, d * 0.78, 0, legH + h * 0.08, d * 0.02, 0.02)
      roundedBox(g, fabric, 'fabric', w * 0.9, h - legH, d * 0.16, 0, legH + (h - legH) / 2, -d / 2 + d * 0.08, 0.02)
      roundedBox(g, fabric, 'fabric', w * 0.16, h * 0.42, d * 0.55, -w / 2 + w * 0.1, h * 0.62, -d * 0.08, 0.016)
      roundedBox(g, fabric, 'fabric', w * 0.16, h * 0.42, d * 0.55, w / 2 - w * 0.1, h * 0.62, -d * 0.08, 0.016)
      roundedBox(g, fabric, 'fabric', w * 0.12, h * 0.28, d * 0.7, -w / 2 + w * 0.06, legH + h * 0.2, 0, 0.012)
      roundedBox(g, fabric, 'fabric', w * 0.12, h * 0.28, d * 0.7, w / 2 - w * 0.06, legH + h * 0.2, 0, 0.012)
      return g
    },
  },
  {
    id: 'pouf',
    name: 'Pouf',
    category: 'living',
    tags: ['seat'],
    defaultSize: { w: 0.5, d: 0.5, h: 0.4 },
    price: 120,
    materialSlots: { fabric: ref('boucle') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      cylinder(g, matOf(ctx, 'fabric'), 'fabric', 0.5, h, 0, h / 2, 0, 'y', 20).scale.set(w, 1, d)
      return g
    },
  },
  {
    id: 'tv-unit',
    name: 'TV unit',
    category: 'living',
    tags: ['storage'],
    defaultSize: { w: 1.8, d: 0.42, h: 0.46 },
    price: 420,
    materialSlots: { body: ref('oak-planks'), metal: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const body = matOf(ctx, 'body')
      const metal = matOf(ctx, 'metal')
      roundedBox(g, body, 'body', w, h, d, 0, h / 2, 0, 0.008)
      roundedBox(g, metal, 'metal', w * 0.3, h * 0.55, 0.02, -w * 0.28, h * 0.42, d / 2 - 0.012, 0.002)
      roundedBox(g, metal, 'metal', w * 0.3, h * 0.55, 0.02, w * 0.28, h * 0.42, d / 2 - 0.012, 0.002)
      roundedBox(g, metal, 'metal', w * 0.22, h * 0.5, d * 0.7, 0, h * 0.4, 0, 0)
      return g
    },
  },
  {
    id: 'tv',
    name: 'Flat screen',
    category: 'living',
    tags: ['screen'],
    defaultSize: { w: 1.25, d: 0.18, h: 0.78 },
    price: 690,
    materialSlots: { frame: ref('metal-black'), screen: ref('paint-charcoal') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      const screen = matOf(ctx, 'screen')
      const standH = clamp(h * 0.12, 0.04, 0.1)
      roundedBox(g, frame, 'frame', w * 0.28, standH, d, 0, standH / 2, 0, 0.004)
      roundedBox(g, frame, 'frame', w * 0.08, h * 0.18, d * 0.4, 0, standH + h * 0.08, 0, 0.004)
      roundedBox(g, frame, 'frame', w, h - standH, d * 0.35, 0, standH + (h - standH) / 2, -d * 0.1, 0.006)
      roundedBox(g, screen, 'screen', w * 0.92, (h - standH) * 0.86, d * 0.08, 0, standH + (h - standH) * 0.52, d * 0.08, 0.002)
      return g
    },
  },
  {
    id: 'sideboard',
    name: 'Sideboard',
    category: 'living',
    tags: ['storage'],
    defaultSize: { w: 1.6, d: 0.45, h: 0.75 },
    price: 680,
    materialSlots: { body: ref('walnut-planks'), metal: ref('metal-brass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.008)
      for (const x of [-w * 0.25, w * 0.25]) {
        cylinder(g, matOf(ctx, 'metal'), 'metal', 0.008, h * 0.22, x, h * 0.55, d / 2 - 0.01, 'y', 8)
      }
      return g
    },
  },
  {
    id: 'side-table',
    name: 'Side table',
    category: 'living',
    tags: ['table'],
    defaultSize: { w: 0.45, d: 0.45, h: 0.55 },
    price: 160,
    materialSlots: { top: ref('oak-planks'), legs: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const topT = clamp(h * 0.08, 0.02, 0.04)
      fourLegs(g, matOf(ctx, 'legs'), 'legs', w, d, h - topT, 0.018)
      roundedBox(g, matOf(ctx, 'top'), 'top', w, topT, d, 0, h - topT / 2, 0, 0.006)
      return g
    },
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    category: 'living',
    tags: ['heat', 'light'],
    defaultSize: { w: 1.3, d: 0.5, h: 1.15 },
    price: 980,
    materialSlots: { body: ref('stone-slate'), fire: ref('paint-terracotta') },
    light: { color: '#ff9944', intensity: 18, lumens: 600, kelvin: 1800, distance: 6, offsetY: 0.35 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const body = matOf(ctx, 'body')
      roundedBox(g, body, 'body', w, h, d, 0, h / 2, 0, 0.01)
      roundedBox(g, body, 'body', w * 0.62, h * 0.42, d * 0.4, 0, h * 0.38, d * 0.22, 0.01)
      emissiveBox(g, '#ff7a33', 'fire', w * 0.48, h * 0.22, d * 0.12, 0, h * 0.32, d * 0.28)
      roundedBox(g, body, 'body', w * 1, h * 0.08, d * 1, 0, h * 0.72, d * 0.02, 0.006)
      return g
    },
  },
  {
    id: 'bean-bag',
    name: 'Bean bag',
    category: 'living',
    tags: ['seat'],
    defaultSize: { w: 0.85, d: 0.85, h: 0.7 },
    price: 180,
    materialSlots: { fabric: ref('fabric-linen') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      ellipsoid(g, matOf(ctx, 'fabric'), 'fabric', w, h, d, 0, h / 2, 0)
      return g
    },
  },
  {
    id: 'piano',
    name: 'Upright piano',
    category: 'living',
    tags: ['music'],
    defaultSize: { w: 1.5, d: 0.62, h: 1.25 },
    price: 2400,
    materialSlots: { body: ref('paint-charcoal'), keys: ref('plaster-white') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const body = matOf(ctx, 'body')
      const keys = matOf(ctx, 'keys')
      fourLegs(g, body, 'body', w, d, h * 0.12, 0.035)
      roundedBox(g, body, 'body', w, h * 0.78, d * 0.85, 0, h * 0.12 + h * 0.39, -d * 0.04, 0.012)
      roundedBox(g, body, 'body', w, h * 0.1, d, 0, h * 0.92, 0, 0.008)
      roundedBox(g, keys, 'keys', w * 0.82, h * 0.06, d * 0.22, 0, h * 0.2, d / 2 - d * 0.12, 0.004)
      roundedBox(g, body, 'body', w * 0.7, h * 0.04, 0.02, 0, h * 0.24, d / 2 - 0.02, 0)
      return g
    },
  },
]

registerEntries(entries)
