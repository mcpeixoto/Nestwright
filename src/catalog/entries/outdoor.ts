import type { CatalogEntry } from '../types'
import { cylinder, ellipsoid, emissiveBox, fourLegs, group, matOf, roundedBox, torusRing } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

const entries: CatalogEntry[] = [
  {
    id: 'garden-sofa',
    name: 'Garden sofa',
    category: 'outdoor',
    tags: ['seat'],
    defaultSize: { w: 1.8, d: 0.8, h: 0.75 },
    price: 640,
    materialSlots: { frame: ref('metal-black'), cushion: ref('fabric-linen') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      roundedBox(g, frame, 'frame', w, h * 0.08, d, 0, h * 0.2, 0, 0.006)
      roundedBox(g, frame, 'frame', 0.04, h, 0.04, -w / 2 + 0.02, h / 2, -d / 2 + 0.02, 0)
      roundedBox(g, frame, 'frame', 0.04, h, 0.04, w / 2 - 0.02, h / 2, -d / 2 + 0.02, 0)
      roundedBox(g, frame, 'frame', w, h * 0.5, 0.04, 0, h * 0.6, -d / 2 + 0.02, 0)
      roundedBox(g, matOf(ctx, 'cushion'), 'cushion', w * 0.9, h * 0.16, d * 0.7, 0, h * 0.32, d * 0.05, 0.02)
      return g
    },
  },
  {
    id: 'lounger',
    name: 'Lounger',
    category: 'outdoor',
    tags: ['seat'],
    defaultSize: { w: 0.7, d: 1.9, h: 0.85 },
    price: 320,
    materialSlots: { frame: ref('metal-black'), fabric: ref('fabric-linen') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      fourLegs(g, matOf(ctx, 'frame'), 'frame', w, d, h * 0.28, 0.02)
      roundedBox(g, matOf(ctx, 'fabric'), 'fabric', w * 0.9, h * 0.1, d * 0.72, 0, h * 0.34, d * 0.08, 0.012)
      roundedBox(g, matOf(ctx, 'fabric'), 'fabric', w * 0.9, h * 0.55, d * 0.12, 0, h * 0.62, -d / 2 + d * 0.1, 0.012)
      return g
    },
  },
  {
    id: 'parasol',
    name: 'Parasol',
    category: 'outdoor',
    tags: ['shade'],
    defaultSize: { w: 2.2, d: 2.2, h: 2.4 },
    price: 180,
    materialSlots: { fabric: ref('paint-ochre'), pole: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      cylinder(g, matOf(ctx, 'pole'), 'pole', 0.03, h * 0.85, 0, h * 0.42, 0, 'y', 8)
      const canopy = cylinder(g, matOf(ctx, 'fabric'), 'fabric', 0.5, h * 0.08, 0, h * 0.9, 0, 'y', 20)
      canopy.scale.set(w, 1, d)
      const base = cylinder(g, matOf(ctx, 'pole'), 'pole', 0.5, h * 0.06, 0, h * 0.03, 0, 'y', 12)
      base.scale.set(w * 0.2, 1, d * 0.2)
      return g
    },
  },
  {
    id: 'outdoor-dining-set',
    name: 'Outdoor dining set',
    category: 'outdoor',
    tags: ['table', 'seat'],
    defaultSize: { w: 1.8, d: 1.1, h: 0.75 },
    price: 780,
    materialSlots: { top: ref('wood-cladding'), frame: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const topT = 0.04
      fourLegs(g, matOf(ctx, 'frame'), 'frame', w * 0.7, d * 0.55, h - topT, 0.025)
      roundedBox(g, matOf(ctx, 'top'), 'top', w, topT, d, 0, h - topT / 2, 0, 0.006)
      roundedBox(g, matOf(ctx, 'frame'), 'frame', w * 0.9, 0.04, 0.04, 0, h * 0.45, -d / 2 + 0.04, 0)
      roundedBox(g, matOf(ctx, 'frame'), 'frame', w * 0.9, 0.04, 0.04, 0, h * 0.45, d / 2 - 0.04, 0)
      return g
    },
  },
  {
    id: 'bbq',
    name: 'Barbecue',
    category: 'outdoor',
    tags: ['cook'],
    defaultSize: { w: 1.2, d: 0.6, h: 1.15 },
    price: 420,
    materialSlots: { body: ref('metal-black'), metal: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const body = matOf(ctx, 'body')
      roundedBox(g, body, 'body', w, h * 0.55, d, 0, h * 0.4, 0, 0.01)
      roundedBox(g, matOf(ctx, 'metal'), 'metal', w * 0.85, h * 0.08, d * 0.7, 0, h * 0.72, 0, 0.004)
      roundedBox(g, body, 'body', w * 0.5, h * 0.22, d * 0.25, -w * 0.15, h * 0.86, -d * 0.1, 0.006)
      cylinder(g, body, 'body', 0.04, h * 0.2, -w / 2 + 0.06, h * 0.1, d / 2 - 0.08, 'y', 8)
      cylinder(g, body, 'body', 0.04, h * 0.2, w / 2 - 0.06, h * 0.1, -d / 2 + 0.08, 'y', 8)
      return g
    },
  },
  {
    id: 'hot-tub',
    name: 'Hot tub',
    category: 'outdoor',
    tags: ['water'],
    defaultSize: { w: 1.9, d: 1.9, h: 0.85 },
    price: 3200,
    materialSlots: { shell: ref('wood-cladding'), water: ref('paint-navy') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const shell = cylinder(g, matOf(ctx, 'shell'), 'shell', 0.5, h, 0, h / 2, 0, 'y', 24)
      shell.scale.set(w, 1, d)
      const water = cylinder(g, matOf(ctx, 'water'), 'water', 0.42, h * 0.12, 0, h * 0.82, 0, 'y', 20)
      water.scale.set(w, 1, d)
      return g
    },
  },
  {
    id: 'firepit',
    name: 'Fire pit',
    category: 'outdoor',
    tags: ['light'],
    defaultSize: { w: 0.8, d: 0.8, h: 0.4 },
    price: 240,
    materialSlots: { body: ref('metal-black'), fire: ref('paint-terracotta') },
    light: { color: '#ff8a3d', intensity: 16, distance: 5, offsetY: 0.25 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const bowl = cylinder(g, matOf(ctx, 'body'), 'body', 0.5, h * 0.55, 0, h * 0.28, 0, 'y', 20)
      bowl.scale.set(w, 1, d)
      emissiveBox(g, '#ff7a2a', 'fire', w * 0.45, h * 0.28, d * 0.45, 0, h * 0.55, 0)
      return g
    },
  },
  {
    id: 'bench-garden',
    name: 'Garden bench',
    category: 'outdoor',
    tags: ['seat'],
    defaultSize: { w: 1.4, d: 0.55, h: 0.85 },
    price: 280,
    materialSlots: { wood: ref('wood-cladding'), metal: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      fourLegs(g, matOf(ctx, 'metal'), 'metal', w, d, h * 0.45, 0.025)
      roundedBox(g, matOf(ctx, 'wood'), 'wood', w, h * 0.08, d, 0, h * 0.5, 0, 0.006)
      roundedBox(g, matOf(ctx, 'wood'), 'wood', w, h * 0.42, 0.04, 0, h * 0.75, -d / 2 + 0.03, 0.004)
      return g
    },
  },
  {
    id: 'swing',
    name: 'Garden swing',
    category: 'outdoor',
    tags: ['seat'],
    defaultSize: { w: 1.5, d: 1.2, h: 1.9 },
    price: 540,
    materialSlots: { frame: ref('metal-black'), fabric: ref('fabric-linen') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      roundedBox(g, frame, 'frame', 0.05, h, 0.05, -w / 2 + 0.04, h / 2, -d / 2 + 0.04, 0)
      roundedBox(g, frame, 'frame', 0.05, h, 0.05, w / 2 - 0.04, h / 2, -d / 2 + 0.04, 0)
      roundedBox(g, frame, 'frame', 0.05, h, 0.05, -w / 2 + 0.04, h / 2, d / 2 - 0.04, 0)
      roundedBox(g, frame, 'frame', 0.05, h, 0.05, w / 2 - 0.04, h / 2, d / 2 - 0.04, 0)
      roundedBox(g, frame, 'frame', w, 0.05, 0.05, 0, h - 0.04, -d / 2 + 0.04, 0)
      roundedBox(g, frame, 'frame', w, 0.05, 0.05, 0, h - 0.04, d / 2 - 0.04, 0)
      roundedBox(g, matOf(ctx, 'fabric'), 'fabric', w * 0.7, h * 0.08, d * 0.4, 0, h * 0.4, 0, 0.012)
      roundedBox(g, matOf(ctx, 'fabric'), 'fabric', w * 0.7, h * 0.28, 0.04, 0, h * 0.55, -d * 0.12, 0.008)
      return g
    },
  },
  {
    id: 'trampoline',
    name: 'Trampoline',
    category: 'outdoor',
    tags: ['play'],
    defaultSize: { w: 2.4, d: 2.4, h: 0.85 },
    price: 260,
    materialSlots: { frame: ref('metal-black'), mat: ref('paint-charcoal') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const mat = cylinder(g, matOf(ctx, 'mat'), 'mat', 0.5, 0.04, 0, h - 0.02, 0, 'y', 24)
      mat.scale.set(w, 1, d)
      const tube = 0.02
      const radius = Math.min(w, d) / 2 - tube
      torusRing(g, matOf(ctx, 'frame'), 'frame', radius, tube, 0, h - tube, 0)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const legH = Math.max(0.05, h - tube * 2)
        cylinder(g, matOf(ctx, 'frame'), 'frame', 0.02, legH, Math.cos(a) * (w / 2 - 0.08), legH / 2, Math.sin(a) * (d / 2 - 0.08), 'y', 6)
      }
      return g
    },
  },
  {
    id: 'bicycle',
    name: 'Bicycle',
    category: 'outdoor',
    tags: ['cycle'],
    defaultSize: { w: 0.5, d: 1.7, h: 1.05 },
    price: 420,
    materialSlots: { frame: ref('paint-navy'), metal: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      const metal = matOf(ctx, 'metal')
      const tube = Math.min(0.015, w * 0.04)
      const r = Math.min(h * 0.32, d * 0.22, 0.34)
      for (const z of [-d / 2 + r, d / 2 - r]) {
        const wheel = torusRing(g, metal, 'metal', Math.max(0.04, r - tube), tube, 0, r, z, false)
        wheel.rotation.y = Math.PI / 2
      }
      cylinder(g, frame, 'frame', 0.015, Math.max(0.05, d - r * 2), 0, r + 0.05, 0, 'z', 6)
      roundedBox(g, frame, 'frame', w, 0.03, 0.03, 0, h - 0.015, -d * 0.15, 0)
      roundedBox(g, metal, 'metal', w * 0.35, 0.04, d * 0.12, 0, r * 0.9, d * 0.05, 0.004)
      return g
    },
  },
  {
    id: 'car',
    name: 'Hatchback',
    category: 'outdoor',
    tags: ['vehicle'],
    defaultSize: { w: 1.75, d: 4.1, h: 1.5 },
    price: 18000,
    materialSlots: { body: ref('paint-navy'), glass: ref('glass'), metal: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const body = matOf(ctx, 'body')
      const wheelR = Math.min(0.32, h * 0.22, w * 0.16)
      roundedBox(g, body, 'body', w * 0.92, h * 0.38, d * 0.96, 0, wheelR + h * 0.12, 0, 0.08)
      roundedBox(g, body, 'body', w * 0.82, h * 0.32, d * 0.48, 0, wheelR + h * 0.42, -d * 0.06, 0.06)
      roundedBox(g, matOf(ctx, 'glass'), 'glass', w * 0.7, h * 0.16, d * 0.28, 0, wheelR + h * 0.48, d * 0.02, 0.02)
      for (const x of [-w / 2 + wheelR, w / 2 - wheelR]) {
        for (const z of [-d * 0.3, d * 0.3]) {
          torusRing(g, matOf(ctx, 'metal'), 'metal', wheelR * 0.72, wheelR * 0.22, x, wheelR, z, false)
        }
      }
      return g
    },
  },
  {
    id: 'dog-house',
    name: 'Dog house',
    category: 'outdoor',
    tags: ['pet'],
    defaultSize: { w: 0.8, d: 1.0, h: 0.85 },
    price: 150,
    materialSlots: { wood: ref('wood-cladding') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const wood = matOf(ctx, 'wood')
      roundedBox(g, wood, 'wood', w, h * 0.62, d, 0, h * 0.31, 0, 0.008)
      roundedBox(g, wood, 'wood', w * 1, h * 0.08, d * 0.7, 0, h * 0.7, -d * 0.05, 0.004)
      roundedBox(g, wood, 'wood', w, h * 0.28, 0.04, 0, h * 0.82, -d / 2 + 0.04, 0.004)
      return g
    },
  },
  {
    id: 'cat-tree',
    name: 'Cat tree',
    category: 'outdoor',
    tags: ['pet'],
    defaultSize: { w: 0.6, d: 0.5, h: 1.3 },
    price: 120,
    materialSlots: { post: ref('carpet-grey'), plush: ref('plaster-warm') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'post'), 'post', w, 0.06, d, 0, 0.03, 0, 0.004)
      cylinder(g, matOf(ctx, 'post'), 'post', 0.05, h * 0.75, -w * 0.1, h * 0.4, 0, 'y', 8)
      roundedBox(g, matOf(ctx, 'plush'), 'plush', w * 0.55, 0.06, d * 0.7, w * 0.1, h * 0.55, 0, 0.008)
      ellipsoid(g, matOf(ctx, 'plush'), 'plush', w * 0.45, h * 0.22, d * 0.45, 0, h * 0.85, 0)
      return g
    },
  },
]

registerEntries(entries)
