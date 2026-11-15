import * as THREE from 'three'
import type { KitchenKind, KitchenModule, KitchenSpec } from '../../model/kitchen'
import { readKitchen } from '../../model/kitchen'
import type { BuildContext, CatalogEntry } from '../types'
import { cylinder, glassPane, group, handle, matOf, roundedBox, torusRing } from '../parts'
import { registerEntries } from '../registry'

const ref = (id: string) => ({ id })

function drawModule(
  g: THREE.Group,
  ctx: BuildContext,
  spec: KitchenSpec,
  module: KitchenModule,
  x: number,
  yBase: number,
  z: number,
  width: number,
  depth: number,
  baseH: number,
  alongX: boolean,
): void {
  const body = matOf(ctx, 'body')
  const front = matOf(ctx, 'front')
  const metal = matOf(ctx, 'metal')
  const top = matOf(ctx, 'top')
  const basin = matOf(ctx, 'basin')
  const tall = module.type === 'fridge-tall'
  const height = tall ? ctx.size.h : baseH
  const hw = alongX ? width : depth
  const hd = alongX ? depth : width
  roundedBox(g, body, 'body', hw, height, hd, x, yBase + height / 2, z, 0.006)
  const topT = Math.min(0.035, height * 0.08)
  // 4 mm eased edge: roundedBox only rounds above 3 mm, and a worktop must not end in a knife edge.
  if (!tall) roundedBox(g, top, 'top', hw, topT, hd, x, yBase + height - topT / 2, z, 0.004)
  const doorH = tall ? height * 0.92 : height * 0.72
  const doorY = yBase + (spec.plinth ? height * 0.14 : height * 0.08) + doorH / 2
  const frontZ = alongX ? z + hd / 2 - 0.012 : x - hw / 2 + 0.012
  const doorW = (alongX ? hw : hd) * 0.9
  const doorD = 0.016
  if (module.type !== 'open-shelf') {
    if (alongX) roundedBox(g, front, 'front', doorW, doorH, doorD, x, Math.min(doorY, yBase + height - doorH / 2 - 0.01), frontZ, 0.003)
    else roundedBox(g, front, 'front', doorD, doorH, doorW, frontZ, Math.min(doorY, yBase + height - doorH / 2 - 0.01), z, 0.003)
  } else {
    for (const t of [0.35, 0.65]) {
      if (alongX) roundedBox(g, front, 'front', hw * 0.9, 0.02, hd * 0.8, x, yBase + height * t, z, 0)
      else roundedBox(g, front, 'front', hd * 0.8, 0.02, hw * 0.9, x, yBase + height * t, z, 0)
    }
  }
  if (module.type === 'base-drawers') {
    const hy = yBase + height * 0.55
    if (alongX) handle(g, metal, 'metal', spec.handle, x, hy, z + hd / 2 - 0.004, false)
    else handle(g, metal, 'metal', spec.handle, x - hw / 2 + 0.004, hy, z, false)
  } else if (module.type !== 'open-shelf') {
    const hy = yBase + height * 0.45
    if (alongX) handle(g, metal, 'metal', spec.handle, x + hw * 0.28, hy, z + hd / 2 - 0.004, true)
    else handle(g, metal, 'metal', spec.handle, x - hw / 2 + 0.004, hy, z + hd * 0.28, true)
  }
  if (module.type === 'sink') {
    roundedBox(g, basin, 'basin', hw * 0.7, Math.min(0.06, height * 0.12), hd * 0.55, x, yBase + height * 0.9, z, 0.02)
    cylinder(g, metal, 'metal', 0.01, Math.min(0.14, height * 0.2), x, yBase + height * 0.82, z - hd * 0.12, 'y', 8)
    roundedBox(g, metal, 'metal', 0.08, 0.012, 0.02, x, yBase + height - 0.01, z - hd * 0.04, 0)
  }
  if (module.type === 'hob') {
    roundedBox(g, metal, 'metal', hw * 0.8, 0.012, hd * 0.7, x, yBase + height - 0.004, z, 0)
    for (const ox of [-hw * 0.18, hw * 0.18]) {
      for (const oz of [-hd * 0.16, hd * 0.16]) {
        torusRing(g, metal, 'metal', Math.min(hw, hd) * 0.1, 0.006, alongX ? x + ox : x, yBase + height + 0.004, alongX ? z + oz : z + oz)
      }
    }
  }
  if (module.type === 'oven' || module.type === 'dishwasher') {
    const glass = matOf(ctx, 'glass')
    if (alongX) glassPane(g, glass, 'glass', hw * 0.55, height * 0.32, 0.01, x, yBase + height * 0.42, z + hd / 2 - 0.008, 0.4)
    else glassPane(g, glass, 'glass', 0.01, height * 0.32, hd * 0.55, x - hw / 2 + 0.008, yBase + height * 0.42, z, 0.4)
  }
}

function drawWallBox(
  g: THREE.Group,
  ctx: BuildContext,
  spec: KitchenSpec,
  x: number,
  z: number,
  width: number,
  depth: number,
  y: number,
  height: number,
  alongX: boolean,
): void {
  const body = matOf(ctx, 'body')
  const front = matOf(ctx, 'front')
  const metal = matOf(ctx, 'metal')
  const hw = alongX ? width : depth
  const hd = alongX ? depth : width
  roundedBox(g, body, 'body', hw, height, hd, x, y + height / 2, z, 0.005)
  if (alongX) {
    roundedBox(g, front, 'front', hw * 0.9, height * 0.86, 0.016, x, y + height / 2, z + hd / 2 - 0.01, 0.003)
    handle(g, metal, 'metal', spec.handle, x + hw * 0.28, y + height * 0.45, z + hd / 2 - 0.002, true)
  } else {
    roundedBox(g, front, 'front', 0.016, height * 0.86, hw * 0.9, x - hw / 2 + 0.01, y + height / 2, z, 0.003)
    handle(g, metal, 'metal', spec.handle, x - hw / 2 + 0.002, y + height * 0.45, z, true)
  }
}

function layout(
  g: THREE.Group,
  ctx: BuildContext,
  spec: KitchenSpec,
  modules: KitchenModule[],
  length: number,
  depth: number,
  alongX: boolean,
  origin: number,
  cross: number,
): void {
  const sum = modules.reduce((total, module) => total + module.width, 0) || 1
  const { h } = ctx.size
  const wall = spec.wall
  const baseH = wall ? Math.min(0.9, h * 0.46) : h
  let cursor = -length / 2
  for (const module of modules) {
    const width = (module.width / sum) * length
    const center = cursor + width / 2
    const x = alongX ? origin + center : cross
    const z = alongX ? cross : origin + center
    drawModule(g, ctx, spec, module, x, 0, z, width, depth, baseH, alongX)
    const skipWall = module.type === 'fridge-tall' || (module.type === 'hob' && spec.hood)
    if (wall && !skipWall) {
      const wallH = Math.min(spec.wallH, Math.max(0.25, h - baseH - 0.05))
      const wallD = Math.min(depth * 0.62, 0.38)
      const wallCross = alongX ? cross - depth / 2 + wallD / 2 : cross + depth / 2 - wallD / 2
      drawWallBox(
        g,
        ctx,
        spec,
        alongX ? x : wallCross,
        alongX ? wallCross : z,
        width,
        wallD,
        h - wallH,
        wallH,
        alongX,
      )
    }
    if (module.type === 'hob' && spec.hood) {
      const hoodD = Math.min(depth * 0.7, 0.45)
      const hoodH = Math.max(0.2, h - baseH - 0.2)
      const metal = matOf(ctx, 'metal')
      if (alongX) roundedBox(g, metal, 'metal', width * 0.9, hoodH, hoodD, x, h - hoodH / 2, cross - depth / 2 + hoodD / 2, 0.006)
      else roundedBox(g, metal, 'metal', hoodD, hoodH, width * 0.9, cross + depth / 2 - hoodD / 2, h - hoodH / 2, z, 0.006)
    }
    if (module.type === 'fridge-tall') {
      /* carcass already reaches the top of the item */
    }
    cursor += width
  }
}

export function buildKitchen(ctx: BuildContext, kind: KitchenKind): THREE.Group {
  const spec = readKitchen(ctx.params, kind)
  const g = group()
  const { w, d, h } = ctx.size
  if (kind === 'l') {
    const cab = Math.min(0.6, w * 0.42, d * 0.42, h)
    const mainLen = Math.max(0.2, w - cab)
    layout(g, ctx, spec, spec.modules, mainLen, cab, true, -cab / 2, -d / 2 + cab / 2)
    const returns = spec.returns.length > 0 ? spec.returns : spec.modules
    layout(g, ctx, spec, returns, d, cab, false, 0, w / 2 - cab / 2)
    return g
  }
  layout(g, ctx, spec, spec.modules, w, d, true, 0, 0)
  return g
}

const entries: CatalogEntry[] = [
  {
    id: 'fridge-tall',
    name: 'Tall fridge',
    category: 'kitchen',
    tags: ['appliance'],
    defaultSize: { w: 0.6, d: 0.65, h: 1.85 },
    price: 780,
    materialSlots: { body: ref('plaster-white'), metal: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.01)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.012, h * 0.28, w * 0.32, h * 0.68, d / 2 - 0.012, 'y', 8)
      return g
    },
  },
  {
    id: 'fridge-american',
    name: 'American fridge',
    category: 'kitchen',
    tags: ['appliance'],
    defaultSize: { w: 0.92, d: 0.72, h: 1.8 },
    price: 1240,
    materialSlots: { body: ref('metal-black'), metal: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.012)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.014, h * 0.35, -w * 0.08, h * 0.55, d / 2 - 0.014, 'y', 8)
      cylinder(g, matOf(ctx, 'metal'), 'metal', 0.014, h * 0.22, w * 0.28, h * 0.38, d / 2 - 0.014, 'y', 8)
      return g
    },
  },
  {
    id: 'dining-island-stool',
    name: 'Island stool',
    category: 'kitchen',
    tags: ['seat'],
    defaultSize: { w: 0.42, d: 0.42, h: 0.65 },
    price: 130,
    materialSlots: { seat: ref('leather-black'), frame: ref('metal-black') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      const frame = matOf(ctx, 'frame')
      const seatT = Math.min(0.06, h * 0.12)
      cylinder(g, frame, 'frame', 0.02, h - seatT, 0, (h - seatT) / 2, 0, 'y', 10)
      const foot = cylinder(g, frame, 'frame', 0.5, 0.02, 0, 0.12, 0, 'y', 14)
      foot.scale.set(w * 0.75, 1, d * 0.75)
      const seat = cylinder(g, matOf(ctx, 'seat'), 'seat', 0.5, seatT, 0, h - seatT / 2, 0, 'y', 16)
      seat.scale.set(w, 1, d)
      return g
    },
  },
  {
    id: 'range-hood',
    name: 'Range hood',
    category: 'kitchen',
    tags: ['appliance'],
    defaultSize: { w: 0.9, d: 0.5, h: 0.4 },
    price: 340,
    mount: 'wall',
    mountHeight: 1.5,
    materialSlots: { body: ref('metal-black'), metal: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h * 0.45, d, 0, h * 0.22, 0, 0.008)
      roundedBox(g, matOf(ctx, 'metal'), 'metal', w * 0.28, h * 0.55, d * 0.4, 0, h * 0.7, -d * 0.1, 0.004)
      return g
    },
  },
  {
    id: 'microwave',
    name: 'Microwave',
    category: 'kitchen',
    tags: ['appliance'],
    defaultSize: { w: 0.5, d: 0.38, h: 0.3 },
    price: 140,
    materialSlots: { body: ref('metal-black'), glass: ref('glass') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.006)
      glassPane(g, matOf(ctx, 'glass'), 'glass', w * 0.55, h * 0.62, 0.01, -w * 0.08, h * 0.5, d / 2 - 0.01, 0.35)
      return g
    },
  },
  {
    id: 'coffee-machine',
    name: 'Coffee machine',
    category: 'kitchen',
    tags: ['appliance'],
    defaultSize: { w: 0.28, d: 0.4, h: 0.36 },
    price: 220,
    materialSlots: { body: ref('metal-black'), metal: ref('chrome') },
    build: (ctx) => {
      const { w, d, h } = ctx.size
      const g = group()
      roundedBox(g, matOf(ctx, 'body'), 'body', w, h, d, 0, h / 2, 0, 0.008)
      roundedBox(g, matOf(ctx, 'metal'), 'metal', w * 0.35, h * 0.16, d * 0.3, 0, h * 0.72, d * 0.08, 0.004)
      cylinder(g, matOf(ctx, 'metal'), 'metal', Math.min(0.03, w * 0.12), h * 0.1, 0, h * 0.08, d * 0.12, 'y', 10)
      return g
    },
  },
  {
    id: 'kitchen-run',
    name: 'Kitchen run',
    category: 'kitchen',
    tags: ['kitchen', 'cabinet'],
    defaultSize: { w: 3, d: 0.6, h: 2.2 },
    price: 2400,
    againstWall: true,
    materialSlots: {
      body: ref('plaster-white'),
      front: ref('oak-planks'),
      top: ref('stone-slate'),
      metal: ref('metal-black'),
      basin: ref('plaster-white'),
      glass: ref('glass'),
    },
    build: (ctx) => buildKitchen(ctx, 'run'),
  },
  {
    id: 'kitchen-l',
    name: 'L-shaped kitchen',
    category: 'kitchen',
    tags: ['kitchen', 'cabinet'],
    defaultSize: { w: 2.4, d: 1.8, h: 2.2 },
    price: 3400,
    againstWall: true,
    materialSlots: {
      body: ref('plaster-white'),
      front: ref('walnut-planks'),
      top: ref('marble'),
      metal: ref('metal-brass'),
      basin: ref('plaster-white'),
      glass: ref('glass'),
    },
    build: (ctx) => buildKitchen(ctx, 'l'),
  },
  {
    id: 'kitchen-island',
    name: 'Kitchen island',
    category: 'kitchen',
    tags: ['kitchen', 'cabinet'],
    defaultSize: { w: 1.8, d: 0.9, h: 0.9 },
    price: 1680,
    materialSlots: {
      body: ref('walnut-planks'),
      front: ref('oak-planks'),
      top: ref('marble'),
      metal: ref('metal-black'),
      basin: ref('plaster-white'),
      glass: ref('glass'),
    },
    build: (ctx) => buildKitchen(ctx, 'island'),
  },
]

registerEntries(entries)
