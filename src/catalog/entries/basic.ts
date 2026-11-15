import * as THREE from 'three'
import { metricUVs } from '../../builders/uv'
import { legs, part, tube } from '../geom'
import { registerEntries } from '../registry'
import type { BuildContext, CatalogEntry } from '../types'

const ref = (id: string) => ({ id })

function group(): THREE.Group {
  return new THREE.Group()
}

function mat(ctx: BuildContext, slot: string): THREE.Material {
  return ctx.materials[slot] ?? ctx.materials.fabric ?? new THREE.MeshStandardMaterial({ color: '#cccccc' })
}

function sofa(ctx: BuildContext, armed: boolean): THREE.Group {
  const { w, d, h } = ctx.size
  const g = group()
  const fabric = mat(ctx, 'fabric')
  const wood = mat(ctx, 'legs')
  const legH = Math.min(0.09, h * 0.12)
  const arm = armed ? Math.min(0.12, w * 0.16) : 0
  const backT = Math.min(0.16, d * 0.2)
  legs(g, wood, w, d, legH, Math.max(0.07, arm * 0.4))
  part(g, fabric, Math.max(0.1, w - arm * 2), 0.12, d * 0.72, 0, legH + 0.1, d * 0.06, 0.02)
  part(g, fabric, Math.max(0.1, w - arm * 2 - 0.06), h - legH - 0.12, backT, 0, legH + 0.12 + (h - legH - 0.12) / 2, -d / 2 + backT / 2, 0.02)
  if (armed) {
    part(g, fabric, arm, h - legH, d, -w / 2 + arm / 2, legH + (h - legH) / 2, 0, 0.018)
    part(g, fabric, arm, h - legH, d, w / 2 - arm / 2, legH + (h - legH) / 2, 0, 0.018)
  } else {
    part(g, fabric, 0.08, h * 0.55, d * 0.9, -w / 2 + 0.04, legH + h * 0.28, 0, 0.012)
    part(g, fabric, 0.08, h * 0.55, d * 0.9, w / 2 - 0.04, legH + h * 0.28, 0, 0.012)
  }
  return g
}

function table(ctx: BuildContext, thickTop = 0.05): THREE.Group {
  const { w, d, h } = ctx.size
  const g = group()
  const wood = mat(ctx, 'top')
  const leg = mat(ctx, 'legs')
  const topT = Math.min(thickTop, h * 0.2)
  part(g, wood, w, topT, d, 0, h - topT / 2, 0, 0.012)
  const legH = h - topT
  const inset = Math.min(0.12, w * 0.12, d * 0.12)
  for (const x of [-w / 2 + inset, w / 2 - inset]) {
    for (const z of [-d / 2 + inset, d / 2 - inset]) part(g, leg, 0.05, legH, 0.05, x, legH / 2, z, 0.006)
  }
  return g
}

function chair(ctx: BuildContext, backH: number): THREE.Group {
  const { w, d, h } = ctx.size
  const g = group()
  const seat = mat(ctx, 'seat')
  const wood = mat(ctx, 'frame')
  const seatT = Math.min(0.05, h * 0.08)
  const seatY = h * 0.48
  legs(g, wood, w, d * 0.85, seatY, 0.05)
  part(g, seat, w * 0.92, seatT, d * 0.86, 0, seatY + seatT / 2, 0.01, 0.012)
  part(g, seat, w * 0.9, backH, 0.05, 0, seatY + seatT + backH / 2, -d / 2 + 0.04, 0.012)
  return g
}

function bed(ctx: BuildContext): THREE.Group {
  const { w, d, h } = ctx.size
  const g = group()
  const linen = mat(ctx, 'linen')
  const wood = mat(ctx, 'frame')
  const baseH = Math.min(0.28, h * 0.3)
  part(g, wood, w, baseH, d, 0, baseH / 2, 0, 0.01)
  const mattressH = Math.min(0.22, (h - baseH) * 0.45)
  part(g, linen, w * 0.96, mattressH, d * 0.9, 0, baseH + mattressH / 2, d * 0.02, 0.02)
  part(g, wood, w, h - baseH, 0.08, 0, baseH + (h - baseH) / 2, -d / 2 + 0.04, 0.012)
  part(g, linen, w * 0.34, 0.1, 0.22, -w * 0.18, baseH + mattressH + 0.05, -d * 0.28, 0.02)
  part(g, linen, w * 0.34, 0.1, 0.22, w * 0.18, baseH + mattressH + 0.05, -d * 0.28, 0.02)
  return g
}

const entries: CatalogEntry[] = [
  {
    id: 'sofa-3',
    name: 'Three-seat sofa',
    category: 'living',
    tags: ['seat', 'lounge'],
    defaultSize: { w: 2.2, d: 0.9, h: 0.82 },
    price: 890,
    materialSlots: { fabric: ref('fabric-linen'), legs: ref('walnut-planks') },
    build: (ctx) => sofa(ctx, true),
  },
  {
    id: 'armchair',
    name: 'Armchair',
    category: 'living',
    tags: ['seat', 'lounge'],
    defaultSize: { w: 0.86, d: 0.86, h: 0.8 },
    price: 420,
    materialSlots: { fabric: ref('fabric-velvet-green'), legs: ref('walnut-planks') },
    build: (ctx) => sofa(ctx, true),
  },
  {
    id: 'coffee-table',
    name: 'Coffee table',
    category: 'living',
    tags: ['table'],
    defaultSize: { w: 1.1, d: 0.6, h: 0.4 },
    price: 240,
    materialSlots: { top: ref('oak-planks'), legs: ref('metal-black') },
    build: (ctx) => {
      const g = table(ctx, 0.04)
      part(g, mat(ctx, 'top'), ctx.size.w * 0.8, 0.02, ctx.size.d * 0.7, 0, 0.16, 0, 0.006)
      return g
    },
  },
  {
    id: 'dining-table',
    name: 'Dining table',
    category: 'dining',
    tags: ['table'],
    defaultSize: { w: 1.6, d: 0.9, h: 0.75 },
    price: 640,
    materialSlots: { top: ref('oak-planks'), legs: ref('walnut-planks') },
    build: (ctx) => table(ctx, 0.045),
  },
  {
    id: 'dining-chair',
    name: 'Dining chair',
    category: 'dining',
    tags: ['seat'],
    defaultSize: { w: 0.46, d: 0.5, h: 0.9 },
    price: 140,
    materialSlots: { seat: ref('fabric-linen'), frame: ref('oak-planks') },
    build: (ctx) => chair(ctx, ctx.size.h * 0.42),
  },
  {
    id: 'bed-double',
    name: 'Double bed',
    category: 'bedroom',
    tags: ['sleep'],
    defaultSize: { w: 1.6, d: 2.1, h: 1.05 },
    price: 980,
    materialSlots: { linen: ref('fabric-linen'), frame: ref('walnut-planks') },
    build: bed,
  },
  {
    id: 'bed-single',
    name: 'Single bed',
    category: 'bedroom',
    tags: ['sleep'],
    defaultSize: { w: 0.9, d: 2.0, h: 1.0 },
    price: 620,
    materialSlots: { linen: ref('fabric-linen'), frame: ref('oak-planks') },
    build: bed,
  },
  {
    id: 'nightstand',
    name: 'Nightstand',
    category: 'bedroom',
    tags: ['storage'],
    defaultSize: { w: 0.48, d: 0.4, h: 0.55 },
    price: 160,
    materialSlots: { body: ref('oak-planks') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const wood = mat(ctx, 'body')
      part(g, wood, w, h * 0.72, d, 0, h * 0.36, 0, 0.01)
      part(g, wood, w * 0.84, 0.02, d * 0.7, 0, h * 0.48, 0.02, 0)
      part(g, wood, w, 0.04, d, 0, h - 0.02, 0, 0.008)
      return g
    },
  },
  {
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'bedroom',
    tags: ['storage'],
    defaultSize: { w: 1.2, d: 0.6, h: 2.1 },
    price: 740,
    materialSlots: { body: ref('oak-planks'), handle: ref('metal-brass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      part(g, mat(ctx, 'body'), w, h - 0.06, d, 0, (h - 0.06) / 2 + 0.06, 0, 0.008)
      part(g, mat(ctx, 'handle'), 0.02, 0.16, 0.03, -0.04, h * 0.55, d / 2, 0)
      part(g, mat(ctx, 'handle'), 0.02, 0.16, 0.03, 0.04, h * 0.55, d / 2, 0)
      return g
    },
  },
  {
    id: 'desk',
    name: 'Desk',
    category: 'office',
    tags: ['work', 'table'],
    defaultSize: { w: 1.4, d: 0.7, h: 0.75 },
    price: 480,
    materialSlots: { top: ref('oak-planks'), legs: ref('metal-black') },
    build: (ctx) => {
      const g = table(ctx, 0.04)
      const { w, d, h } = ctx.size
      part(g, mat(ctx, 'top'), w * 0.32, h * 0.55, d * 0.9, w * 0.3, h * 0.28, 0, 0.008)
      return g
    },
  },
  {
    id: 'office-chair',
    name: 'Office chair',
    category: 'office',
    tags: ['seat', 'work'],
    defaultSize: { w: 0.64, d: 0.64, h: 1.1 },
    price: 310,
    materialSlots: { seat: ref('fabric-linen'), frame: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const seat = mat(ctx, 'seat')
      const frame = mat(ctx, 'frame')
      const seatY = h * 0.46
      tube(g, frame, 0.04, seatY - 0.06, 0, (seatY - 0.06) / 2 + 0.04, 0)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const x = Math.cos(a) * w * 0.42
        const z = Math.sin(a) * d * 0.42
        part(g, frame, w * 0.42, 0.03, 0.04, x / 2, 0.04, z / 2, 0.004)
        tube(g, frame, 0.03, 0.04, x, 0.02, z, 10)
      }
      part(g, seat, w * 0.78, 0.08, d * 0.72, 0, seatY, 0.02, 0.02)
      part(g, seat, w * 0.7, h - seatY - 0.08, 0.06, 0, seatY + (h - seatY) / 2, -d * 0.28, 0.016)
      return g
    },
  },
  {
    id: 'bookshelf',
    name: 'Bookshelf',
    category: 'living',
    tags: ['storage', 'books'],
    defaultSize: { w: 0.9, d: 0.32, h: 1.8 },
    price: 360,
    materialSlots: { frame: ref('oak-planks'), books: ref('paint-navy') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const wood = mat(ctx, 'frame')
      const books = mat(ctx, 'books')
      part(g, wood, 0.03, h, d, -w / 2 + 0.015, h / 2, 0, 0)
      part(g, wood, 0.03, h, d, w / 2 - 0.015, h / 2, 0, 0)
      const shelves = 5
      for (let i = 0; i < shelves; i++) {
        const y = 0.02 + (i * (h - 0.06)) / (shelves - 1)
        part(g, wood, w - 0.04, 0.02, d, 0, y, 0, 0)
        if (i < shelves - 1) {
          const gap = (h - 0.06) / (shelves - 1)
          part(g, books, 0.06, gap * 0.7, d * 0.7, -w * 0.22, y + gap * 0.4, 0, 0)
          part(g, books, 0.05, gap * 0.55, d * 0.65, -w * 0.08, y + gap * 0.32, 0, 0)
        }
      }
      return g
    },
  },
  {
    id: 'floor-lamp',
    name: 'Floor lamp',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 0.4, d: 0.4, h: 1.6 },
    price: 180,
    materialSlots: { stand: ref('metal-brass'), shade: ref('fabric-linen') },
    light: { color: '#ffd8a8', intensity: 30, distance: 8, offsetY: 1.45 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const shade = (mat(ctx, 'shade') as THREE.MeshStandardMaterial).clone()
      shade.emissive = new THREE.Color('#ffd2a0')
      shade.emissiveIntensity = 0.45
      tube(g, mat(ctx, 'stand'), Math.min(w, d) * 0.28, 0.03, 0, 0.015, 0)
      tube(g, mat(ctx, 'stand'), 0.015, h * 0.78, 0, h * 0.42, 0)
      const shadeH = h * 0.18
      const mesh = new THREE.Mesh(
        metricUVs(new THREE.CylinderGeometry(Math.min(w, d) * 0.42, Math.min(w, d) * 0.28, shadeH, 16, 1, true)),
        shade,
      )
      mesh.position.y = h - shadeH / 2
      mesh.castShadow = true
      mesh.userData.shade = true
      mesh.userData.slot = 'shade'
      g.add(mesh)
      return g
    },
  },
  {
    id: 'pendant-lamp',
    name: 'Pendant lamp',
    category: 'lighting',
    tags: ['light'],
    defaultSize: { w: 0.42, d: 0.42, h: 0.9 },
    price: 150,
    materialSlots: { cord: ref('metal-black'), shade: ref('plaster-warm') },
    light: { color: '#fff0d4', intensity: 40, distance: 7, offsetY: 0.35 },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const shadeMat = (mat(ctx, 'shade') as THREE.MeshStandardMaterial).clone()
      shadeMat.emissive = new THREE.Color('#ffe0b0')
      shadeMat.emissiveIntensity = 0.55
      tube(g, mat(ctx, 'cord'), 0.008, h * 0.62, 0, h * 0.69, 0)
      const shadeR = Math.min(w, d) / 2
      const shade = new THREE.Mesh(metricUVs(new THREE.CylinderGeometry(shadeR, shadeR * 0.56, h * 0.32, 20, 1, true)), shadeMat)
      shade.position.y = Math.max(h * 0.16, h * 0.32) / 2 + 0.01
      shade.castShadow = true
      shade.userData.shade = true
      shade.userData.slot = 'shade'
      g.add(shade)
      return g
    },
  },
  {
    id: 'rug',
    name: 'Rug',
    category: 'decor',
    tags: ['floor'],
    defaultSize: { w: 2.0, d: 1.4, h: 0.02 },
    price: 220,
    materialSlots: { pile: ref('carpet-grey') },
    build: (ctx) => {
      const g = group()
      const { w, d, h } = ctx.size
      part(g, mat(ctx, 'pile'), w, h, d, 0, h / 2, 0, 0.01)
      return g
    },
  },
  {
    id: 'plant-pot',
    name: 'Potted plant',
    category: 'plants',
    tags: ['plant'],
    defaultSize: { w: 0.4, d: 0.4, h: 0.85 },
    price: 45,
    materialSlots: { pot: ref('paint-terracotta'), leaf: ref('paint-sage') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const r = Math.min(w, d) / 2
      const pot = new THREE.Mesh(metricUVs(new THREE.CylinderGeometry(r * 0.72, r * 0.55, h * 0.32, 16)), mat(ctx, 'pot'))
      pot.position.y = h * 0.16
      pot.castShadow = true
      pot.receiveShadow = true
      g.add(pot)
      const leaf = mat(ctx, 'leaf')
      tube(g, leaf, r * 0.55, r * 0.5, 0, h * 0.48, 0, 10)
      tube(g, leaf, r * 0.4, r * 0.45, r * 0.15, h * 0.7, 0, 10)
      tube(g, leaf, r * 0.32, r * 0.4, -r * 0.12, h * 0.78, r * 0.08, 10)
      return g
    },
  },
  {
    id: 'toilet',
    name: 'Toilet',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 0.4, d: 0.68, h: 0.78 },
    price: 280,
    materialSlots: { ceramic: ref('plaster-white') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const ceramic = mat(ctx, 'ceramic')
      part(g, ceramic, w * 0.7, h * 0.28, d * 0.48, 0, h * 0.16, d * 0.12, 0.04)
      part(g, ceramic, w * 0.78, 0.05, d * 0.55, 0, h * 0.34, d * 0.08, 0.02)
      part(g, ceramic, w * 0.55, h * 0.42, d * 0.22, 0, h * 0.52, -d * 0.32, 0.02)
      return g
    },
  },
  {
    id: 'bathtub',
    name: 'Bathtub',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 1.7, d: 0.75, h: 0.58 },
    price: 760,
    materialSlots: { shell: ref('plaster-white'), rim: ref('marble') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      part(g, mat(ctx, 'shell'), w, h * 0.78, d, 0, h * 0.39, 0, 0.04)
      part(g, mat(ctx, 'rim'), w * 0.92, h * 0.16, d * 0.78, 0, h * 0.7, 0, 0.03)
      return g
    },
  },
  {
    id: 'shower',
    name: 'Shower',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 0.9, d: 0.9, h: 2.1 },
    price: 640,
    materialSlots: { tray: ref('tile-white'), frame: ref('metal-black'), glass: ref('glass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      part(g, mat(ctx, 'tray'), w, 0.08, d, 0, 0.04, 0, 0.01)
      part(g, mat(ctx, 'frame'), 0.04, h - 0.08, 0.04, -w / 2 + 0.02, h / 2, d / 2 - 0.02, 0)
      part(g, mat(ctx, 'frame'), 0.04, h - 0.08, 0.04, w / 2 - 0.02, h / 2, d / 2 - 0.02, 0)
      const pane = part(g, mat(ctx, 'glass'), w - 0.08, h * 0.86, 0.015, 0, h * 0.5, d / 2 - 0.02, 0)
      const glass = pane.material as THREE.MeshStandardMaterial
      if (!glass.transparent) {
        const cloned = glass.clone()
        cloned.transparent = true
        cloned.opacity = 0.28
        pane.material = cloned
      }
      tube(g, mat(ctx, 'frame'), 0.04, 0.02, 0, h - 0.16, -d * 0.2, 10)
      return g
    },
  },
  {
    id: 'washbasin',
    name: 'Washbasin',
    category: 'bathroom',
    tags: ['fixture'],
    defaultSize: { w: 0.62, d: 0.46, h: 0.85 },
    price: 340,
    materialSlots: { vanity: ref('oak-planks'), basin: ref('plaster-white'), tap: ref('metal-brass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      part(g, mat(ctx, 'vanity'), w, h * 0.72, d, 0, h * 0.36, 0, 0.01)
      part(g, mat(ctx, 'basin'), w * 0.7, 0.08, d * 0.55, 0, h * 0.78, -d * 0.02, 0.03)
      tube(g, mat(ctx, 'tap'), 0.012, h * 0.16, 0, h * 0.9, -d * 0.12)
      part(g, mat(ctx, 'tap'), 0.08, 0.02, 0.02, 0, h * 0.98, -d * 0.06, 0)
      return g
    },
  },
]

registerEntries(entries)
