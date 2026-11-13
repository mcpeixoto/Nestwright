import type { CatalogEntry } from '../types'
import { clamp, cylinder, fourLegs, group, matOf, roundedBox } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

const entries: CatalogEntry[] = [
  {
    id: 'desk-l',
    name: 'L-shaped desk',
    category: 'office',
    tags: ['work', 'table'],
    defaultSize: { w: 1.6, d: 1.4, h: 0.75 },
    price: 620,
    materialSlots: { top: ref('oak-planks'), legs: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const top = matOf(ctx, 'top')
      const legs = matOf(ctx, 'legs')
      const topT = clamp(0.04, 0.02, h * 0.1)
      const arm = clamp(Math.min(w, d) * 0.38, 0.35, 0.55)
      fourLegs(g, legs, 'legs', w, d, h - topT, 0.025)
      roundedBox(g, top, 'top', w, topT, arm, 0, h - topT / 2, -d / 2 + arm / 2, 0.006)
      roundedBox(g, top, 'top', arm, topT, d, -w / 2 + arm / 2, h - topT / 2, 0, 0.006)
      return g
    },
  },
  {
    id: 'standing-desk',
    name: 'Standing desk',
    category: 'office',
    tags: ['work', 'table'],
    defaultSize: { w: 1.4, d: 0.7, h: 1.15 },
    price: 740,
    materialSlots: { top: ref('oak-planks'), legs: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const topT = clamp(0.04, 0.02, h * 0.06)
      const legs = matOf(ctx, 'legs')
      roundedBox(g, legs, 'legs', w * 0.7, 0.04, d * 0.55, 0, 0.02, 0, 0.004)
      cylinder(g, legs, 'legs', 0.035, h - topT - 0.04, -w * 0.22, (h - topT) / 2, 0, 'y', 10)
      cylinder(g, legs, 'legs', 0.035, h - topT - 0.04, w * 0.22, (h - topT) / 2, 0, 'y', 10)
      roundedBox(g, matOf(ctx, 'top'), 'top', w, topT, d, 0, h - topT / 2, 0, 0.006)
      return g
    },
  },
  {
    id: 'filing-cabinet',
    name: 'Filing cabinet',
    category: 'office',
    tags: ['storage'],
    defaultSize: { w: 0.42, d: 0.5, h: 0.7 },
    price: 180,
    materialSlots: { body: ref('metal-black'), metal: ref('metal-brass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.006)
      for (let i = 0; i < 3; i++) {
        cylinder(g, matOf(ctx, 'metal'), 'metal', 0.01, w * 0.35, 0, h * (0.25 + i * 0.25), d / 2 - 0.012, 'x', 8)
      }
      return g
    },
  },
  {
    id: 'monitor',
    name: 'Monitor',
    category: 'office',
    tags: ['screen', 'work'],
    defaultSize: { w: 0.62, d: 0.2, h: 0.48 },
    price: 280,
    materialSlots: { frame: ref('metal-black'), screen: ref('paint-navy') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      const stand = clamp(h * 0.18, 0.04, 0.1)
      roundedBox(g, frame, 'frame', w * 0.35, stand, d, 0, stand / 2, 0, 0.004)
      roundedBox(g, frame, 'frame', w, h - stand, d * 0.28, 0, stand + (h - stand) / 2, -d * 0.05, 0.004)
      roundedBox(g, matOf(ctx, 'screen'), 'screen', w * 0.9, (h - stand) * 0.82, 0.008, 0, stand + (h - stand) * 0.52, d * 0.08, 0)
      return g
    },
  },
  {
    id: 'shelving-unit',
    name: 'Shelving unit',
    category: 'office',
    tags: ['storage'],
    defaultSize: { w: 0.9, d: 0.35, h: 1.8 },
    price: 240,
    materialSlots: { frame: ref('oak-planks'), books: ref('paint-navy') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const wood = matOf(ctx, 'frame')
      const books = matOf(ctx, 'books')
      roundedBox(g, wood, 'frame', 0.03, h, d, -w / 2 + 0.015, h / 2, 0, 0)
      roundedBox(g, wood, 'frame', 0.03, h, d, w / 2 - 0.015, h / 2, 0, 0)
      roundedBox(g, wood, 'frame', w, 0.02, d, 0, h - 0.01, 0, 0)
      roundedBox(g, wood, 'frame', w, 0.02, d, 0, 0.01, 0, 0)
      const shelves = 4
      for (let i = 1; i <= shelves; i++) {
        const y = (h * i) / (shelves + 1)
        roundedBox(g, wood, 'frame', w - 0.04, 0.02, d, 0, y, 0, 0)
        roundedBox(g, books, 'books', 0.08, h * 0.12, d * 0.7, -w * 0.2 + i * 0.04, y + h * 0.08, 0, 0)
      }
      return g
    },
  },
  {
    id: 'gaming-chair',
    name: 'Gaming chair',
    category: 'office',
    tags: ['seat', 'work'],
    defaultSize: { w: 0.7, d: 0.7, h: 1.25 },
    price: 340,
    materialSlots: { seat: ref('leather-black'), frame: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const seat = matOf(ctx, 'seat')
      const frame = matOf(ctx, 'frame')
      const seatY = h * 0.42
      cylinder(g, frame, 'frame', 0.04, seatY - 0.05, 0, (seatY - 0.05) / 2 + 0.03, 0, 'y', 10)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const x = Math.cos(a) * (w / 2 - 0.04)
        const z = Math.sin(a) * (d / 2 - 0.04)
        const spoke = cylinder(g, frame, 'frame', 0.018, Math.max(0.04, Math.hypot(x, z)), x / 2, 0.03, z / 2, 'z', 6)
        spoke.rotation.y = Math.atan2(x, z)
        cylinder(g, frame, 'frame', 0.028, 0.04, x, 0.02, z, 'y', 8)
      }
      roundedBox(g, seat, 'seat', w * 0.72, 0.1, d * 0.7, 0, seatY, 0.02, 0.02)
      roundedBox(g, seat, 'seat', w * 0.68, h - seatY - 0.04, d * 0.16, 0, seatY + (h - seatY) / 2, -d / 2 + d * 0.1, 0.02)
      roundedBox(g, seat, 'seat', w * 0.1, h * 0.22, d * 0.55, -w / 2 + w * 0.08, seatY + 0.02, 0, 0.012)
      roundedBox(g, seat, 'seat', w * 0.1, h * 0.22, d * 0.55, w / 2 - w * 0.08, seatY + 0.02, 0, 0.012)
      return g
    },
  },
]

registerEntries(entries)
