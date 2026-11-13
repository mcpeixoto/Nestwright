import type { CatalogEntry } from '../types'
import { cylinder, ellipsoid, group, lathe, matOf, roundedBox } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

function pot(g: ReturnType<typeof group>, ctx: Parameters<CatalogEntry['build']>[0], potH: number) {
  const { w, d } = ctx.size
  const mesh = cylinder(g, matOf(ctx, 'pot'), 'pot', 0.5, potH, 0, potH / 2, 0, 'y', 14)
  mesh.scale.set(w * 0.55, 1, d * 0.55)
}

const entries: CatalogEntry[] = [
  {
    id: 'monstera',
    name: 'Monstera',
    category: 'plants',
    tags: ['plant'],
    defaultSize: { w: 0.7, d: 0.7, h: 1.2 },
    price: 48,
    materialSlots: { pot: ref('paint-terracotta'), leaf: ref('paint-sage') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const potH = h * 0.22
      pot(g, ctx, potH)
      const leaf = matOf(ctx, 'leaf')
      ellipsoid(g, leaf, 'leaf', w * 0.7, h * 0.28, d * 0.35, -w * 0.12, h * 0.55, 0)
      ellipsoid(g, leaf, 'leaf', w * 0.55, h * 0.22, d * 0.5, w * 0.16, h * 0.72, d * 0.05)
      ellipsoid(g, leaf, 'leaf', w * 0.4, h * 0.18, d * 0.4, 0, h * 0.9, -d * 0.05)
      return g
    },
  },
  {
    id: 'fiddle-leaf',
    name: 'Fiddle-leaf fig',
    category: 'plants',
    tags: ['plant'],
    defaultSize: { w: 0.55, d: 0.55, h: 1.5 },
    price: 65,
    materialSlots: { pot: ref('plaster-white'), leaf: ref('paint-sage') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      pot(g, ctx, h * 0.18)
      cylinder(g, matOf(ctx, 'leaf'), 'leaf', 0.02, h * 0.45, 0, h * 0.4, 0, 'y', 6)
      for (let i = 0; i < 5; i++) {
        const y = h * (0.5 + i * 0.09)
        ellipsoid(g, matOf(ctx, 'leaf'), 'leaf', w * (0.7 - i * 0.08), h * 0.1, d * 0.35, (i % 2 === 0 ? -1 : 1) * w * 0.12, y, 0)
      }
      return g
    },
  },
  {
    id: 'cactus',
    name: 'Cactus',
    category: 'plants',
    tags: ['plant'],
    defaultSize: { w: 0.28, d: 0.28, h: 0.55 },
    price: 22,
    materialSlots: { pot: ref('paint-terracotta'), leaf: ref('paint-sage') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      pot(g, ctx, h * 0.28)
      const body = cylinder(g, matOf(ctx, 'leaf'), 'leaf', 0.5, h * 0.62, 0, h * 0.28 + h * 0.31, 0, 'y', 12)
      body.scale.set(w * 0.55, 1, d * 0.55)
      cylinder(g, matOf(ctx, 'leaf'), 'leaf', w * 0.12, h * 0.28, w * 0.2, h * 0.62, 0, 'y', 8)
      return g
    },
  },
  {
    id: 'hanging-plant',
    name: 'Hanging plant',
    category: 'plants',
    tags: ['plant'],
    defaultSize: { w: 0.4, d: 0.4, h: 0.8 },
    price: 36,
    mount: 'ceiling',
    materialSlots: { pot: ref('plaster-white'), leaf: ref('paint-sage'), cord: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      cylinder(g, matOf(ctx, 'cord'), 'cord', 0.006, h * 0.35, 0, h * 0.82, 0, 'y', 6)
      const hanger = cylinder(g, matOf(ctx, 'pot'), 'pot', 0.5, h * 0.16, 0, h * 0.55, 0, 'y', 12)
      hanger.scale.set(w * 0.55, 1, d * 0.55)
      ellipsoid(g, matOf(ctx, 'leaf'), 'leaf', w * 0.7, h * 0.35, d * 0.7, 0, h * 0.28, 0)
      ellipsoid(g, matOf(ctx, 'leaf'), 'leaf', w * 0.35, h * 0.28, d * 0.3, -w * 0.12, h * 0.22, d * 0.04)
      return g
    },
  },
  {
    id: 'olive-tree-pot',
    name: 'Potted olive',
    category: 'plants',
    tags: ['plant'],
    defaultSize: { w: 0.7, d: 0.7, h: 1.6 },
    price: 95,
    materialSlots: { pot: ref('concrete'), leaf: ref('paint-sage'), trunk: ref('walnut-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      pot(g, ctx, h * 0.16)
      lathe(g, matOf(ctx, 'trunk'), 'trunk', [
        [0.12, 0],
        [0.1, 0.4],
        [0.14, 0.7],
        [0.08, 1],
      ], w * 0.2, h * 0.55, d * 0.2, 0, h * 0.14, 0)
      ellipsoid(g, matOf(ctx, 'leaf'), 'leaf', w, h * 0.42, d, 0, h * 0.75, 0)
      return g
    },
  },
  {
    id: 'herb-box',
    name: 'Herb box',
    category: 'plants',
    tags: ['plant'],
    defaultSize: { w: 0.6, d: 0.22, h: 0.28 },
    price: 28,
    materialSlots: { pot: ref('oak-planks'), leaf: ref('paint-sage') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'pot'), 'pot', w, h * 0.45, d, 0, h * 0.22, 0, 0.006)
      for (const x of [-w * 0.28, 0, w * 0.28]) {
        ellipsoid(g, matOf(ctx, 'leaf'), 'leaf', w * 0.22, h * 0.55, d * 0.7, x, h * 0.55, 0)
      }
      return g
    },
  },
]

registerEntries(entries)
