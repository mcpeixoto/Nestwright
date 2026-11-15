import type { CatalogEntry } from '../types'
import { clamp, cylinder, group, markShade, matOf, roundedBox, torusRing } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

const entries: CatalogEntry[] = [
  {
    id: 'ceiling-light',
    name: 'Ceiling light',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 0.48, d: 0.48, h: 0.22 },
    price: 90,
    materialSlots: { shade: ref('plaster-white'), metal: ref('metal-brass') },
    mount: 'ceiling',
    light: { color: '#fff4e0', intensity: 40, lumens: 1000, kelvin: 3000, distance: 8, offsetY: 0.08 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const canopy = cylinder(g, matOf(ctx, 'metal'), 'metal', 0.5, h * 0.2, 0, h - h * 0.1, 0, 'y', 16)
      canopy.scale.set(w * 0.45, 1, d * 0.45)
      const shade = cylinder(g, matOf(ctx, 'shade'), 'shade', 0.5, h * 0.7, 0, h * 0.4, 0, 'y', 20)
      shade.scale.set(w, 1, d)
      markShade(shade)
      return g
    },
  },
  {
    id: 'wall-sconce',
    name: 'Wall sconce',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 0.16, d: 0.22, h: 0.28 },
    price: 70,
    materialSlots: { shade: ref('fabric-linen'), metal: ref('metal-brass') },
    mount: 'wall',
    mountHeight: 1.55,
    light: { color: '#ffe0b8', intensity: 12, lumens: 400, kelvin: 2700, distance: 4, offsetY: 0.12 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'metal'), 'metal', w, h, d * 0.2, 0, h / 2, -d / 2 + d * 0.1, 0.004)
      const shade = roundedBox(g, matOf(ctx, 'shade'), 'shade', w, h * 0.55, d * 0.8, 0, h * 0.55, d * 0.05, 0.02)
      markShade(shade)
      return g
    },
  },
  {
    id: 'spotlight-track',
    name: 'Spotlight track',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 1.2, d: 0.12, h: 0.16 },
    price: 160,
    materialSlots: { metal: ref('metal-black'), shade: ref('paint-charcoal') },
    mount: 'ceiling',
    light: { color: '#fff6ea', intensity: 28, lumens: 400, kelvin: 3000, distance: 6, offsetY: 0.04, spot: true, angle: 0.6 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'metal'), 'metal', w, h * 0.25, d, 0, h - h * 0.12, 0, 0.003)
      for (const x of [-w * 0.32, 0, w * 0.32]) {
        cylinder(g, matOf(ctx, 'metal'), 'metal', 0.015, h * 0.4, x, h * 0.55, 0, 'y', 8)
        const head = cylinder(g, matOf(ctx, 'shade'), 'shade', Math.min(d, h) * 0.35, h * 0.35, x, h * 0.22, 0, 'y', 12)
        markShade(head)
      }
      return g
    },
  },
  {
    id: 'table-lamp',
    name: 'Table lamp',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 0.28, d: 0.28, h: 0.48 },
    price: 75,
    materialSlots: { shade: ref('fabric-linen'), stand: ref('plaster-white') },
    light: { color: '#ffe6c2', intensity: 14, lumens: 450, kelvin: 2700, distance: 4, offsetY: 0.32 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const base = cylinder(g, matOf(ctx, 'stand'), 'stand', 0.5, h * 0.12, 0, h * 0.06, 0, 'y', 16)
      base.scale.set(w, 1, d)
      cylinder(g, matOf(ctx, 'stand'), 'stand', Math.min(w, d) * 0.06, h * 0.4, 0, h * 0.32, 0, 'y', 8)
      const shade = cylinder(g, matOf(ctx, 'shade'), 'shade', 0.5, h * 0.38, 0, h * 0.78, 0, 'y', 16)
      shade.scale.set(w * 0.9, 1, d * 0.9)
      markShade(shade)
      return g
    },
  },
  {
    id: 'arc-floor-lamp',
    name: 'Arc floor lamp',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 1.5, d: 0.4, h: 1.9 },
    price: 260,
    materialSlots: { shade: ref('fabric-linen'), stand: ref('metal-brass') },
    light: { color: '#ffe3c0', intensity: 22, lumens: 1200, kelvin: 2700, distance: 6, offsetY: 1.7 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const stand = matOf(ctx, 'stand')
      const baseW = clamp(w * 0.28, 0.2, 0.45)
      roundedBox(g, stand, 'stand', baseW, 0.06, d, -w / 2 + baseW / 2, 0.03, 0, 0.008)
      cylinder(g, stand, 'stand', 0.015, h * 0.72, -w / 2 + baseW * 0.5, h * 0.4, 0, 'y', 8)
      cylinder(g, stand, 'stand', 0.012, w * 0.7, w * 0.05, h * 0.78, 0, 'x', 8)
      const shadeW = clamp(w * 0.22, 0.16, 0.36)
      const shadeH = clamp(h * 0.18, 0.12, 0.28)
      const shade = roundedBox(g, matOf(ctx, 'shade'), 'shade', shadeW, shadeH, d, w / 2 - shadeW / 2, h - shadeH / 2, 0, 0.02)
      markShade(shade)
      return g
    },
  },
  {
    id: 'chandelier',
    name: 'Chandelier',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 0.7, d: 0.7, h: 0.7 },
    price: 480,
    materialSlots: { metal: ref('metal-brass'), shade: ref('plaster-warm') },
    mount: 'ceiling',
    light: { color: '#fff0d0', intensity: 34, lumens: 1500, kelvin: 2700, distance: 7, offsetY: 0.28 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const metal = matOf(ctx, 'metal')
      cylinder(g, metal, 'metal', 0.01, h * 0.35, 0, h * 0.82, 0, 'y', 8)
      torusRing(g, metal, 'metal', Math.min(w, d) * 0.28, 0.012, 0, h * 0.45, 0)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const x = Math.cos(a) * (w / 2 - w * 0.12)
        const z = Math.sin(a) * (d / 2 - d * 0.12)
        const shade = cylinder(g, matOf(ctx, 'shade'), 'shade', Math.min(w, d) * 0.08, h * 0.22, x, h * 0.22, z, 'y', 10)
        markShade(shade)
      }
      const cap = cylinder(g, metal, 'metal', 0.5, 0.03, 0, h - 0.015, 0, 'y', 12)
      cap.scale.set(w * 0.25, 1, d * 0.25)
      return g
    },
  },
  {
    id: 'led-strip',
    name: 'LED strip',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 2, d: 0.04, h: 0.04 },
    price: 60,
    materialSlots: { metal: ref('metal-black'), glow: ref('plaster-white') },
    mount: 'wall',
    mountHeight: 2.2,
    light: { color: '#fff8ee', intensity: 16, lumens: 500, kelvin: 3000, distance: 4, offsetY: 0.02 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'metal'), 'metal', w, h, d, 0, h / 2, 0, 0.002)
      const glow = roundedBox(g, matOf(ctx, 'glow'), 'glow', w * 0.96, h * 0.35, d * 0.4, 0, h * 0.55, 0, 0)
      markShade(glow)
      return g
    },
  },
]

registerEntries(entries)
