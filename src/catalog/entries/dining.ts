import type { CatalogEntry } from '../types'
import { clamp, cylinder, fourLegs, group, markShade, matOf, paramNum, roundedBox, torusRing } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

const entries: CatalogEntry[] = [
  {
    id: 'round-table',
    name: 'Round table',
    category: 'dining',
    tags: ['table'],
    defaultSize: { w: 1.2, d: 1.2, h: 0.75 },
    price: 540,
    materialSlots: { top: ref('oak-planks'), legs: ref('walnut-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const topT = clamp(0.045, 0.02, h * 0.12)
      const top = cylinder(g, matOf(ctx, 'top'), 'top', 0.5, topT, 0, h - topT / 2, 0, 'y', 28)
      top.scale.set(w, 1, d)
      cylinder(g, matOf(ctx, 'legs'), 'legs', Math.min(w, d) * 0.06, h - topT, 0, (h - topT) / 2, 0, 'y', 12)
      const foot = cylinder(g, matOf(ctx, 'legs'), 'legs', 0.5, 0.03, 0, 0.015, 0, 'y', 20)
      foot.scale.set(w * 0.55, 1, d * 0.55)
      return g
    },
  },
  {
    id: 'extendable-table',
    name: 'Extendable table',
    category: 'dining',
    tags: ['table'],
    defaultSize: { w: 1.8, d: 0.9, h: 0.75 },
    price: 890,
    materialSlots: { top: ref('oak-planks'), legs: ref('walnut-planks') },
    params: [{ key: 'leaves', label: 'Leaves', kind: 'number', min: 0, max: 2, step: 1, default: 1 }],
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const topT = clamp(0.04, 0.02, h * 0.1)
      fourLegs(g, matOf(ctx, 'legs'), 'legs', w, d, h - topT, 0.032)
      roundedBox(g, matOf(ctx, 'top'), 'top', w, topT, d, 0, h - topT / 2, 0, 0.006)
      const leaves = Math.round(clamp(paramNum(ctx.params, 'leaves', 1), 0, 2))
      if (leaves > 0) {
        roundedBox(g, matOf(ctx, 'legs'), 'legs', 0.01, topT, d * 0.8, 0, h - topT / 2, 0, 0)
      }
      if (leaves > 1) {
        roundedBox(g, matOf(ctx, 'legs'), 'legs', 0.01, topT, d * 0.8, w * 0.22, h - topT / 2, 0, 0)
      }
      return g
    },
  },
  {
    id: 'bar-stool',
    name: 'Bar stool',
    category: 'dining',
    tags: ['seat'],
    defaultSize: { w: 0.42, d: 0.42, h: 0.75 },
    price: 140,
    materialSlots: { seat: ref('leather-black'), frame: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      const seatT = clamp(h * 0.08, 0.04, 0.07)
      cylinder(g, frame, 'frame', 0.02, h - seatT, 0, (h - seatT) / 2, 0, 'y', 10)
      const foot = cylinder(g, frame, 'frame', 0.5, 0.02, 0, 0.14, 0, 'y', 16)
      foot.scale.set(w * 0.7, 1, d * 0.7)
      const seat = cylinder(g, matOf(ctx, 'seat'), 'seat', 0.5, seatT, 0, h - seatT / 2, 0, 'y', 18)
      seat.scale.set(w, 1, d)
      torusRing(g, frame, 'frame', Math.min(w, d) * 0.32, 0.012, 0, h * 0.42, 0, false)
      return g
    },
  },
  {
    id: 'bench',
    name: 'Dining bench',
    category: 'dining',
    tags: ['seat'],
    defaultSize: { w: 1.4, d: 0.4, h: 0.46 },
    price: 260,
    materialSlots: { seat: ref('oak-planks'), legs: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const topT = clamp(h * 0.12, 0.03, 0.06)
      fourLegs(g, matOf(ctx, 'legs'), 'legs', w, d, h - topT, 0.02)
      roundedBox(g, matOf(ctx, 'seat'), 'seat', w, topT, d, 0, h - topT / 2, 0, 0.008)
      return g
    },
  },
  {
    id: 'buffet',
    name: 'Buffet',
    category: 'dining',
    tags: ['storage'],
    defaultSize: { w: 1.6, d: 0.48, h: 0.85 },
    price: 760,
    materialSlots: { body: ref('walnut-planks'), top: ref('marble'), metal: ref('metal-brass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const topT = clamp(0.04, 0.02, h * 0.08)
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h - topT, d * 0.96, 0, (h - topT) / 2, 0, 0.008)
      roundedBox(g, matOf(ctx, 'top'), 'top', w, topT, d, 0, h - topT / 2, 0, 0.004)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.01, h * 0.16, -w * 0.22, h * 0.45, d / 2 - 0.012, 'y', 8)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.01, h * 0.16, w * 0.22, h * 0.45, d / 2 - 0.012, 'y', 8)
      return g
    },
  },
  {
    id: 'pendant-cluster',
    name: 'Pendant cluster',
    category: 'dining',
    tags: ['light'],
    defaultSize: { w: 0.7, d: 0.7, h: 1.1 },
    price: 320,
    materialSlots: { shade: ref('plaster-warm'), cord: ref('metal-black') },
    mount: 'ceiling',
    light: { color: '#fff1d6', intensity: 36, lumens: 1200, kelvin: 2700, distance: 7, offsetY: 0.4 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const shadeMat = matOf(ctx, 'shade')
      const cord = matOf(ctx, 'cord')
      const canopy = cylinder(g, cord, 'cord', 0.5, 0.03, 0, h - 0.015, 0, 'y', 12)
      canopy.scale.set(Math.min(w, d) * 0.35, 1, Math.min(w, d) * 0.35)
      const spots: [number, number, number][] = [
        [0, 0.22, 0],
        [-w * 0.28, 0.38, -d * 0.12],
        [w * 0.26, 0.3, d * 0.16],
      ]
      for (const [x, y, z] of spots) {
        cylinder(g, cord, 'cord', 0.006, h - y - 0.08, x, (h + y) / 2, z, 'y', 6)
        const shade = cylinder(g, shadeMat, 'shade', Math.min(w, d) * 0.16, h * 0.16, x, y, z, 'y', 14)
        markShade(shade)
      }
      return g
    },
  },
]

registerEntries(entries)
