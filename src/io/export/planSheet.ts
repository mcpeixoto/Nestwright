// Pure layout of a printable plan sheet: paper millimetres, fixed scale, no DOM, no jsPDF.
// The renderer in planPdf.ts turns these primitives into PDF drawing calls.

import { levelAreas, roomNetArea, roomNetPolygon } from '../../model/areas'
import { polylabel } from '../../model/geometry'
import { detectRooms } from '../../model/rooms'
import type { Item, Level, Opening, Project, Vec2, Wall } from '../../model/types'
import { formatArea, formatLength } from '../../model/units'
import { openingInterval, pointAlongWall, wallDirection, wallPolygon } from '../../model/walls'
import { fill, translate } from '../../i18n'
import { levelDisplayName, roomDisplayName } from '../../i18n/rooms'

export type PaperSize = 'A4' | 'A3'
export type PlanScale = 50 | 100
export type Orientation = 'landscape' | 'portrait'

export interface PlanSheetOptions {
  scale: PlanScale
  paper: PaperSize
  orientation: Orientation | 'auto'
  /** Levels to print; default: every level with walls (or the first level when none has any). */
  levelIds?: string[]
  /** UI language for labels ('en' | 'pt-PT'). */
  language?: string
  /** Date printed in the title block, `YYYY-MM-DD`. Default: today. */
  date?: string
}

export const DEFAULT_SHEET_OPTIONS: PlanSheetOptions = { scale: 100, paper: 'A3', orientation: 'auto' }

/** RGB, 0..255. */
export type Rgb = readonly [number, number, number]

/** What a primitive depicts; lets tests and the renderer find things without guessing. */
export type PrimitiveTag =
  | 'wall'
  | 'opening'
  | 'door'
  | 'door-swing'
  | 'window'
  | 'item'
  | 'column'
  | 'room-name'
  | 'room-area'
  | 'dimension'
  | 'dimension-text'
  | 'north-arrow'
  | 'scale-bar'
  | 'legend'
  | 'title'
  | 'frame'

export interface LinePrim {
  kind: 'line'
  a: Vec2
  b: Vec2
  /** Stroke width, mm. */
  weight: number
  color: Rgb
  /** Dash pattern in mm, e.g. [1, 0.8]. */
  dash?: number[]
  tag?: PrimitiveTag
}

export interface PolygonPrim {
  kind: 'polygon'
  points: Vec2[]
  fill?: Rgb
  stroke?: Rgb
  weight?: number
  tag?: PrimitiveTag
}

/** Circular arc in paper coordinates (y down): point(t) = centre + r·(cos t, sin t), t from `start` by `sweep`. */
export interface ArcPrim {
  kind: 'arc'
  center: Vec2
  radius: number
  start: number
  sweep: number
  weight: number
  color: Rgb
  tag?: PrimitiveTag
}

export interface TextPrim {
  kind: 'text'
  at: Vec2
  text: string
  /** Font size, pt. */
  size: number
  bold?: boolean
  anchor: 'start' | 'middle' | 'end'
  /** Counter-clockwise rotation on the page, degrees. */
  rotation?: number
  color: Rgb
  tag?: PrimitiveTag
}

export type Primitive = LinePrim | PolygonPrim | ArcPrim | TextPrim

export interface Sheet {
  levelId: string
  levelName: string
  paper: PaperSize
  orientation: Orientation
  scale: PlanScale
  /** Paper size, mm. */
  width: number
  height: number
  /** Paper millimetres per plan metre (20 at 1:50, 10 at 1:100). */
  mmPerMetre: number
  /** False when the drawing is larger than the printable area at this scale and paper. */
  fits: boolean
  /** Size of the drawing (with its outer dimensions) and of the space for it, mm. */
  drawing: { width: number; height: number }
  available: { width: number; height: number }
  /** Paper point (mm) of plan origin: paper = (originX + x·k, originY − y·k). */
  origin: Vec2
  primitives: Primitive[]
}

const PAPERS: Record<PaperSize, { long: number; short: number }> = {
  A4: { long: 297, short: 210 },
  A3: { long: 420, short: 297 },
}

export const MARGIN = 10
export const TITLE_H = 30
const GAP = 4
/** Room on the paper for the overall outer dimensions, left and below the building. */
const OUTER_DIM_OFFSET = 8
const OUTER_DIM_ROOM = 13
const EDGE_ROOM = 3

const INK: Rgb = [30, 30, 30]
const WALL_FILL: Rgb = [55, 55, 55]
const PAPER_FILL: Rgb = [255, 255, 255]
const THIN: Rgb = [70, 70, 70]
const ITEM_INK: Rgb = [120, 120, 120]
const DIM_INK: Rgb = [60, 60, 60]
const MUTED: Rgb = [110, 110, 110]

const W_OPENING = 0.25
const W_SWING = 0.18
const W_WINDOW = 0.18
const W_ITEM = 0.13
const W_DIM = 0.13
const W_FRAME = 0.35

function mmPerMetre(scale: PlanScale): number {
  return 1000 / scale
}

function paperSize(paper: PaperSize, orientation: Orientation): { width: number; height: number } {
  const p = PAPERS[paper]
  return orientation === 'landscape' ? { width: p.long, height: p.short } : { width: p.short, height: p.long }
}

/** Printable area for the drawing itself: inside the margins and above the title block. */
export function drawingArea(paper: PaperSize, orientation: Orientation): { x: number; y: number; width: number; height: number } {
  const size = paperSize(paper, orientation)
  return {
    x: MARGIN,
    y: MARGIN,
    width: size.width - MARGIN * 2,
    height: size.height - MARGIN * 2 - TITLE_H - GAP,
  }
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
}

function grow(box: Box, p: Vec2): void {
  box.minX = Math.min(box.minX, p.x)
  box.minY = Math.min(box.minY, p.y)
  box.maxX = Math.max(box.maxX, p.x)
  box.maxY = Math.max(box.maxY, p.y)
}

function valid(box: Box): boolean {
  return Number.isFinite(box.minX) && box.maxX >= box.minX
}

function itemCorners(item: Item): Vec2[] {
  const hw = item.size.w / 2
  const hd = item.size.d / 2
  const c = Math.cos(item.rotation)
  const s = Math.sin(item.rotation)
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => ({ x: item.position.x + p.x * c - p.y * s, y: item.position.y + p.x * s + p.y * c }))
}

function structuralWalls(level: Level): Wall[] {
  return level.walls.filter((wall) => wall.kind !== 'railing')
}

/** Outer faces of the walls: the building's footprint. */
function buildingBox(level: Level): Box {
  const box = emptyBox()
  for (const wall of level.walls) {
    for (const p of wallPolygon(wall, level.walls)) grow(box, p)
  }
  return box
}

/** Everything drawn in plan metres: walls, items, columns, user dimension lines. */
function contentBox(level: Level): Box {
  const box = buildingBox(level)
  for (const item of level.items) for (const p of itemCorners(item)) grow(box, p)
  for (const column of level.columns) {
    grow(box, { x: column.position.x - column.size / 2, y: column.position.y - column.size / 2 })
    grow(box, { x: column.position.x + column.size / 2, y: column.position.y + column.size / 2 })
  }
  for (const dim of level.dimensions) {
    const d = { x: dim.b.x - dim.a.x, y: dim.b.y - dim.a.y }
    const length = Math.hypot(d.x, d.y)
    if (length < 1e-6) continue
    const n = { x: -d.y / length, y: d.x / length }
    for (const p of [dim.a, dim.b]) {
      grow(box, p)
      grow(box, { x: p.x + n.x * dim.offset, y: p.y + n.y * dim.offset })
    }
  }
  return box
}

interface Frame {
  k: number
  originX: number
  originY: number
}

function toPaper(frame: Frame, p: Vec2): Vec2 {
  return { x: frame.originX + p.x * frame.k, y: frame.originY - p.y * frame.k }
}

function measure(level: Level, k: number): { width: number; height: number; box: Box } {
  const box = contentBox(level)
  if (!valid(box)) return { width: 0, height: 0, box: { minX: -1, minY: -1, maxX: 1, maxY: 1 } }
  const hasOuter = valid(buildingBox(level))
  const left = hasOuter ? OUTER_DIM_ROOM : EDGE_ROOM
  const bottom = hasOuter ? OUTER_DIM_ROOM : EDGE_ROOM
  return {
    width: (box.maxX - box.minX) * k + left + EDGE_ROOM,
    height: (box.maxY - box.minY) * k + bottom + EDGE_ROOM,
    box,
  }
}

function fitsIn(drawing: { width: number; height: number }, area: { width: number; height: number }): boolean {
  return drawing.width <= area.width + 1e-6 && drawing.height <= area.height + 1e-6
}

/** Pick the orientation: fixed, or for `auto` the one that matches the drawing's shape, then the other. */
export function chooseOrientation(
  level: Level,
  options: Pick<PlanSheetOptions, 'scale' | 'paper' | 'orientation'>,
): { orientation: Orientation; fits: boolean } {
  const k = mmPerMetre(options.scale)
  const drawing = measure(level, k)
  if (options.orientation !== 'auto') {
    return { orientation: options.orientation, fits: fitsIn(drawing, drawingArea(options.paper, options.orientation)) }
  }
  const first: Orientation = drawing.height > drawing.width ? 'portrait' : 'landscape'
  const second: Orientation = first === 'landscape' ? 'portrait' : 'landscape'
  for (const orientation of [first, second]) {
    if (fitsIn(drawing, drawingArea(options.paper, orientation))) return { orientation, fits: true }
  }
  return { orientation: first, fits: false }
}

// ------------------------------------------------------------------ drawing helpers

class Ink {
  readonly out: Primitive[] = []
  constructor(readonly frame: Frame) {}

  p(world: Vec2): Vec2 {
    return toPaper(this.frame, world)
  }

  line(a: Vec2, b: Vec2, weight: number, color: Rgb, tag?: PrimitiveTag, dash?: number[]): void {
    this.out.push({ kind: 'line', a: this.p(a), b: this.p(b), weight, color, tag, ...(dash ? { dash } : {}) })
  }

  poly(points: Vec2[], style: { fill?: Rgb; stroke?: Rgb; weight?: number }, tag?: PrimitiveTag): void {
    if (points.length < 2) return
    this.out.push({ kind: 'polygon', points: points.map((q) => this.p(q)), ...style, tag })
  }
}

function addV(a: Vec2, b: Vec2, s = 1): Vec2 {
  return { x: a.x + b.x * s, y: a.y + b.y * s }
}

/** Paper-space angle (y down) of a paper vector. */
function paperAngle(v: Vec2): number {
  return Math.atan2(v.y, v.x)
}

/** Text rotation (ccw degrees) that runs along a paper direction and stays readable. */
function readableRotation(dir: Vec2): number {
  let deg = (-Math.atan2(dir.y, dir.x) * 180) / Math.PI
  if (deg > 90.001) deg -= 180
  if (deg <= -90.001) deg += 180
  return Math.abs(deg) < 1e-9 ? 0 : deg
}

/** Dimension line in paper mm from p to q with 45° ticks and the label above the line. */
function paperDimension(out: Primitive[], p: Vec2, q: Vec2, label: string, size = 6.5): void {
  const d = { x: q.x - p.x, y: q.y - p.y }
  const length = Math.hypot(d.x, d.y)
  if (length < 0.5) return
  const u = { x: d.x / length, y: d.y / length }
  out.push({ kind: 'line', a: p, b: q, weight: W_DIM, color: DIM_INK, tag: 'dimension' })
  const tick = { x: (u.x - u.y) * 1.1, y: (u.y + u.x) * 1.1 }
  for (const end of [p, q]) {
    out.push({
      kind: 'line',
      a: { x: end.x - tick.x, y: end.y - tick.y },
      b: { x: end.x + tick.x, y: end.y + tick.y },
      weight: W_DIM * 2,
      color: DIM_INK,
      tag: 'dimension',
    })
  }
  const rotation = readableRotation(u)
  const rad = (rotation * Math.PI) / 180
  // "Up" for text rotated ccw by `rotation` on a y-down page.
  const up = { x: -Math.sin(rad), y: -Math.cos(rad) }
  const mid = { x: (p.x + q.x) / 2 + up.x * 0.9, y: (p.y + q.y) / 2 + up.y * 0.9 }
  out.push({ kind: 'text', at: mid, text: label, size, anchor: 'middle', rotation, color: DIM_INK, tag: 'dimension-text' })
}

function extension(out: Primitive[], from: Vec2, to: Vec2): void {
  const d = { x: to.x - from.x, y: to.y - from.y }
  const length = Math.hypot(d.x, d.y)
  if (length < 0.3) return
  const u = { x: d.x / length, y: d.y / length }
  out.push({
    kind: 'line',
    a: { x: from.x + u.x * 1, y: from.y + u.y * 1 },
    b: { x: to.x + u.x * 1.5, y: to.y + u.y * 1.5 },
    weight: W_DIM,
    color: DIM_INK,
    tag: 'dimension',
  })
}

// ------------------------------------------------------------------ plan contents

function drawWalls(ink: Ink, level: Level): void {
  for (const wall of level.walls) {
    const poly = wallPolygon(wall, level.walls)
    if (poly.length < 3) continue
    if (wall.kind === 'railing') {
      ink.poly(poly, { stroke: THIN, weight: W_ITEM }, 'wall')
      continue
    }
    ink.poly(poly, { fill: WALL_FILL }, 'wall')
  }
  // Mitred polygons leave notches where three or more walls meet (a T junction). The plain,
  // unmitred band of each straight wall lies inside the wall's own faces and fills them.
  for (const wall of level.walls) {
    if (wall.kind === 'railing' || Math.abs(wall.bulge) > 1e-6) continue
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (length < 1e-6) continue
    const n = { x: -(wall.b.y - wall.a.y) / length, y: (wall.b.x - wall.a.x) / length }
    const h = wall.thickness / 2
    ink.poly([addV(wall.a, n, h), addV(wall.b, n, h), addV(wall.b, n, -h), addV(wall.a, n, -h)], { fill: WALL_FILL }, 'wall')
  }
}

function openingFrame(wall: Wall, opening: Opening) {
  const span = openingInterval(wall, opening)
  const a = pointAlongWall(wall, span.start)
  const b = pointAlongWall(wall, span.end)
  const dir = wallDirection(wall)
  const n = { x: -dir.y, y: dir.x }
  return { a, b, dir, n, width: span.end - span.start, half: wall.thickness / 2 }
}

/** Leaf + quarter-circle swing for a leaf hinged at `hinge` that closes along `along` and opens to `side`. */
function drawSwing(ink: Ink, hinge: Vec2, along: Vec2, side: Vec2, width: number): void {
  const open = addV(hinge, side, width)
  ink.line(hinge, open, W_OPENING, INK, 'door')
  const center = ink.p(hinge)
  const closedP = ink.p(addV(hinge, along, width))
  const openP = ink.p(open)
  const start = paperAngle({ x: closedP.x - center.x, y: closedP.y - center.y })
  const end = paperAngle({ x: openP.x - center.x, y: openP.y - center.y })
  let sweep = end - start
  while (sweep > Math.PI) sweep -= Math.PI * 2
  while (sweep < -Math.PI) sweep += Math.PI * 2
  ink.out.push({ kind: 'arc', center, radius: width * ink.frame.k, start, sweep, weight: W_SWING, color: INK, tag: 'door-swing' })
}

function drawOpening(ink: Ink, wall: Wall, opening: Opening): void {
  const f = openingFrame(wall, opening)
  const h = f.half + 0.012
  // Cut the opening out of the solid wall.
  ink.poly([addV(f.a, f.n, h), addV(f.b, f.n, h), addV(f.b, f.n, -h), addV(f.a, f.n, -h)], { fill: PAPER_FILL }, 'opening')
  // Jambs.
  ink.line(addV(f.a, f.n, f.half), addV(f.a, f.n, -f.half), W_OPENING, INK, 'opening')
  ink.line(addV(f.b, f.n, f.half), addV(f.b, f.n, -f.half), W_OPENING, INK, 'opening')
  const side = opening.flipSide ? { x: -f.n.x, y: -f.n.y } : f.n
  const back = { x: -f.dir.x, y: -f.dir.y }
  switch (opening.type) {
    case 'door': {
      const hinge = opening.flipHinge ? f.b : f.a
      const along = opening.flipHinge ? back : f.dir
      drawSwing(ink, hinge, along, side, f.width)
      break
    }
    case 'double-door': {
      const leaf = f.width / 2
      drawSwing(ink, f.a, f.dir, side, leaf)
      drawSwing(ink, f.b, back, side, leaf)
      break
    }
    case 'sliding-door': {
      const leaf = f.width * 0.55
      const off = f.half * 0.35
      const s1 = addV(f.a, f.n, off)
      ink.line(s1, addV(s1, f.dir, leaf), W_OPENING, INK, 'door')
      const s2 = addV(f.b, f.n, -off)
      ink.line(s2, addV(s2, back, leaf), W_OPENING, INK, 'door')
      break
    }
    case 'garage-door':
      ink.line(f.a, f.b, W_OPENING, INK, 'door', [1.2, 0.8])
      break
    case 'arch':
      break
    default: {
      // Windows: three thin lines across the opening (both faces and the glass).
      for (const t of [f.half, 0, -f.half]) ink.line(addV(f.a, f.n, t), addV(f.b, f.n, t), W_WINDOW, INK, 'window')
    }
  }
}

function drawItems(ink: Ink, level: Level): void {
  for (const item of level.items) {
    if (!(item.size.w > 0 && item.size.d > 0)) continue
    ink.poly(itemCorners(item), { stroke: ITEM_INK, weight: W_ITEM }, 'item')
  }
}

function drawColumns(ink: Ink, level: Level): void {
  for (const column of level.columns) {
    const r = column.size / 2
    const c = column.position
    const points = column.round
      ? Array.from({ length: 24 }, (_, i) => {
          const t = (i / 24) * Math.PI * 2
          return { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }
        })
      : [
          { x: c.x - r, y: c.y - r },
          { x: c.x + r, y: c.y - r },
          { x: c.x + r, y: c.y + r },
          { x: c.x - r, y: c.y + r },
        ]
    ink.poly(points, { fill: WALL_FILL }, 'column')
  }
}

/** Clear inner width and depth along the room's main axis (its longest net edge). */
export function roomClearSpans(net: readonly Vec2[]): { u: Vec2; v: Vec2; minU: number; maxU: number; minV: number; maxV: number } | null {
  if (net.length < 3) return null
  let best = 0
  let u = { x: 1, y: 0 }
  for (let i = 0; i < net.length; i++) {
    const a = net[i]!
    const b = net[(i + 1) % net.length]!
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l > best + 1e-9) {
      best = l
      u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
    }
  }
  // Prefer the axis that reads left-to-right / bottom-to-top.
  if (Math.abs(u.y) > Math.abs(u.x)) u = { x: u.y, y: -u.x }
  if (u.x < 0) u = { x: -u.x, y: -u.y }
  const v = { x: -u.y, y: u.x }
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const p of net) {
    const pu = p.x * u.x + p.y * u.y
    const pv = p.x * v.x + p.y * v.y
    minU = Math.min(minU, pu)
    maxU = Math.max(maxU, pu)
    minV = Math.min(minV, pv)
    maxV = Math.max(maxV, pv)
  }
  return { u, v, minU, maxU, minV, maxV }
}

function drawRooms(ink: Ink, level: Level, project: Project, language: string): void {
  const k = ink.frame.k
  for (const room of detectRooms(level)) {
    if (room.polygon.length < 3) continue
    const net = roomNetPolygon(level, room)
    const at = ink.p(polylabel(room.polygon, 0.08))
    const nameSize = k >= 20 ? 9 : 7.5
    ink.out.push({ kind: 'text', at: { x: at.x, y: at.y - 0.6 }, text: roomDisplayName(language, room.name), size: nameSize, bold: true, anchor: 'middle', color: INK, tag: 'room-name' })
    const area = formatArea(roomNetArea(level, room), project.units)
    ink.out.push({ kind: 'text', at: { x: at.x, y: at.y + nameSize * 0.3528 + 0.6 }, text: area, size: nameSize - 1.5, anchor: 'middle', color: MUTED, tag: 'room-area' })

    const spans = roomClearSpans(net)
    if (!spans) continue
    const width = spans.maxU - spans.minU
    const depth = spans.maxV - spans.minV
    // Skip rooms too small on paper to hold a readable dimension.
    if (Math.min(width, depth) * k < 14) continue
    const inset = Math.min(0.45, depth * 0.18)
    const world = (pu: number, pv: number): Vec2 => ({
      x: spans.u.x * pu + spans.v.x * pv,
      y: spans.u.y * pu + spans.v.y * pv,
    })
    paperDimension(ink.out, ink.p(world(spans.minU, spans.minV + inset)), ink.p(world(spans.maxU, spans.minV + inset)), formatLength(width, project.units))
    const insetU = Math.min(0.45, width * 0.18)
    paperDimension(ink.out, ink.p(world(spans.minU + insetU, spans.minV)), ink.p(world(spans.minU + insetU, spans.maxV)), formatLength(depth, project.units))
  }
}

function drawOuterDimensions(ink: Ink, level: Level, project: Project): void {
  const box = buildingBox(level)
  if (!valid(box) || structuralWalls(level).length === 0) return
  const bl = ink.p({ x: box.minX, y: box.minY })
  const br = ink.p({ x: box.maxX, y: box.minY })
  const tl = ink.p({ x: box.minX, y: box.maxY })
  // Outside everything else drawn (user dimension lines included), so nothing overlaps.
  const content = contentBox(level)
  const below = ink.p({ x: content.minX, y: content.minY }).y + OUTER_DIM_OFFSET
  const left = ink.p({ x: content.minX, y: content.minY }).x - OUTER_DIM_OFFSET
  extension(ink.out, bl, { x: bl.x, y: below })
  extension(ink.out, br, { x: br.x, y: below })
  paperDimension(ink.out, { x: bl.x, y: below }, { x: br.x, y: below }, formatLength(box.maxX - box.minX, project.units), 7)
  extension(ink.out, bl, { x: left, y: bl.y })
  extension(ink.out, tl, { x: left, y: tl.y })
  paperDimension(ink.out, { x: left, y: bl.y }, { x: left, y: tl.y }, formatLength(box.maxY - box.minY, project.units), 7)
}

function drawUserDimensions(ink: Ink, level: Level, project: Project): void {
  for (const dim of level.dimensions) {
    const d = { x: dim.b.x - dim.a.x, y: dim.b.y - dim.a.y }
    const length = Math.hypot(d.x, d.y)
    if (length < 1e-4) continue
    const n = { x: -d.y / length, y: d.x / length }
    const p = addV(dim.a, n, dim.offset)
    const q = addV(dim.b, n, dim.offset)
    if (Math.abs(dim.offset) > 1e-4) {
      extension(ink.out, ink.p(dim.a), ink.p(p))
      extension(ink.out, ink.p(dim.b), ink.p(q))
    }
    paperDimension(ink.out, ink.p(p), ink.p(q), formatLength(length, project.units), 7)
  }
}

// ------------------------------------------------------------------ title strip

function scaleBarTicks(scale: PlanScale, units: Project['units']): { metres: number[]; labels: string[]; unit: string } {
  if (units === 'imperial') {
    const feet = scale === 50 ? [0, 1, 2, 5] : [0, 5, 10, 15]
    return { metres: feet.map((f) => f * 0.3048), labels: feet.map(String), unit: 'ft' }
  }
  const metres = scale === 50 ? [0, 0.5, 1, 2] : [0, 1, 2, 5]
  return { metres, labels: metres.map(String), unit: 'm' }
}

/** Rough Noto Sans advance: enough to keep title text inside its box. */
function approxWidth(text: string, sizePt: number, bold = false): number {
  return text.length * sizePt * 0.3528 * (bold ? 0.6 : 0.55)
}

function clip(text: string, sizePt: number, maxMm: number, bold = false): string {
  if (approxWidth(text, sizePt, bold) <= maxMm) return text
  let out = text
  while (out.length > 1 && approxWidth(`${out}…`, sizePt, bold) > maxMm) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

interface StripInput {
  project: Project
  level: Level
  scale: PlanScale
  paper: PaperSize
  orientation: Orientation
  language: string
  date: string
  k: number
}

function drawStrip(out: Primitive[], width: number, height: number, input: StripInput): void {
  const { project, level, language } = input
  const tr = (key: string) => translate(language, key)
  const x0 = MARGIN
  const y0 = height - MARGIN - TITLE_H
  const w = width - MARGIN * 2
  const rect = (x: number, y: number, rw: number, rh: number, style: { fill?: Rgb; stroke?: Rgb; weight?: number }, tag: PrimitiveTag) =>
    out.push({ kind: 'polygon', points: [{ x, y }, { x: x + rw, y }, { x: x + rw, y: y + rh }, { x, y: y + rh }], ...style, tag })

  rect(x0, y0, w, TITLE_H, { stroke: INK, weight: W_FRAME }, 'frame')
  const northW = 22
  const scaleW = 66
  const legendW = Math.min(64, Math.max(48, w * 0.3))
  const titleW = w - northW - scaleW - legendW
  const xLegend = x0 + titleW
  const xScale = xLegend + legendW
  const xNorth = xScale + scaleW
  for (const x of [xLegend, xScale, xNorth]) {
    out.push({ kind: 'line', a: { x, y: y0 }, b: { x, y: y0 + TITLE_H }, weight: W_DIM, color: INK, tag: 'frame' })
  }

  // Title block.
  const tx = x0 + 3
  const tw = titleW - 6
  const text = (at: Vec2, value: string, size: number, opts: Partial<TextPrim> = {}) =>
    out.push({ kind: 'text', at, text: value, size, anchor: 'start', color: INK, tag: 'title', ...opts })
  text({ x: tx, y: y0 + 6.5 }, clip(project.name || tr('Untitled'), 12, tw, true), 12, { bold: true })
  text({ x: tx, y: y0 + 11.8 }, clip(`${tr('Level')}: ${levelDisplayName(language, level.name)}`, 8.5, tw), 8.5)
  const totals = levelAreas(level)
  const rows = [
    `${tr('Scale')}: 1:${input.scale}   ${tr('Paper')}: ${input.paper} ${tr(input.orientation === 'landscape' ? 'Landscape' : 'Portrait')}`,
    `${tr('Date')}: ${input.date}   ${fill(language, 'Net area {area}', { area: formatArea(totals.net, project.units) })}`,
  ]
  text({ x: tx, y: y0 + 17.3 }, clip(rows[0]!, 7, tw), 7)
  text({ x: tx, y: y0 + 21.6 }, clip(rows[1]!, 7, tw), 7)
  text({ x: tx, y: y0 + 27 }, 'Nestwright', 7, { bold: true, color: MUTED })

  // Legend.
  const lx = xLegend + 3
  text({ x: lx, y: y0 + 4.6 }, tr('Legend'), 7, { bold: true })
  const sampleW = 9
  const rowY = (i: number) => y0 + 8.4 + i * 4.6
  const label = (i: number, key: string) =>
    out.push({ kind: 'text', at: { x: lx + sampleW + 2.5, y: rowY(i) + 1 }, text: clip(tr(key), 6.5, legendW - sampleW - 8), size: 6.5, anchor: 'start', color: INK, tag: 'legend' })
  // Wall.
  rect(lx, rowY(0) - 1, sampleW, 2.2, { fill: WALL_FILL }, 'legend')
  label(0, 'Wall')
  // Door swing.
  {
    const hinge = { x: lx + 1, y: rowY(1) + 1.6 }
    const r = 3.4
    out.push({ kind: 'line', a: hinge, b: { x: hinge.x, y: hinge.y - r }, weight: W_OPENING, color: INK, tag: 'legend' })
    out.push({ kind: 'arc', center: hinge, radius: r, start: 0, sweep: -Math.PI / 2, weight: W_SWING, color: INK, tag: 'legend' })
    label(1, 'Door swing')
  }
  // Window.
  for (const dy of [-0.9, 0, 0.9]) {
    out.push({ kind: 'line', a: { x: lx, y: rowY(2) + dy }, b: { x: lx + sampleW, y: rowY(2) + dy }, weight: W_WINDOW, color: INK, tag: 'legend' })
  }
  label(2, 'Window')
  // Furniture.
  rect(lx + 1, rowY(3) - 1.3, sampleW - 2, 2.6, { stroke: ITEM_INK, weight: W_ITEM }, 'legend')
  label(3, 'Furniture outline')
  // Dimension line.
  {
    const p = { x: lx, y: rowY(4) }
    const q = { x: lx + sampleW, y: rowY(4) }
    out.push({ kind: 'line', a: p, b: q, weight: W_DIM, color: DIM_INK, tag: 'legend' })
    for (const e of [p, q]) {
      out.push({ kind: 'line', a: { x: e.x - 0.8, y: e.y + 0.8 }, b: { x: e.x + 0.8, y: e.y - 0.8 }, weight: W_DIM * 2, color: DIM_INK, tag: 'legend' })
    }
    label(4, 'Dimension line')
  }

  // Scale: written and graphic.
  const sx = xScale + 4
  text({ x: sx, y: y0 + 7.5 }, `${tr('Scale')} 1:${input.scale}`, 10, { bold: true })
  const ticks = scaleBarTicks(input.scale, project.units)
  const barY = y0 + 16
  const barH = 1.6
  for (let i = 0; i + 1 < ticks.metres.length; i++) {
    const a = sx + ticks.metres[i]! * input.k
    const b = sx + ticks.metres[i + 1]! * input.k
    rect(a, barY, b - a, barH, i % 2 === 0 ? { fill: INK, stroke: INK, weight: W_DIM } : { fill: PAPER_FILL, stroke: INK, weight: W_DIM }, 'scale-bar')
  }
  ticks.metres.forEach((m, i) => {
    const last = i === ticks.metres.length - 1
    out.push({
      kind: 'text',
      at: { x: sx + m * input.k, y: barY + barH + 3.4 },
      text: last ? `${ticks.labels[i]} ${ticks.unit}` : ticks.labels[i]!,
      size: 6.5,
      anchor: last ? 'start' : 'middle',
      color: INK,
      tag: 'scale-bar',
    })
  })

  // North arrow: plan north is (sin n, cos n), as the sun code reads `environment.north`.
  const north = project.environment?.north ?? 0
  const c = { x: xNorth + northW / 2, y: y0 + TITLE_H / 2 + 2 }
  const r = 7
  const dir = { x: Math.sin(north), y: -Math.cos(north) }
  const side = { x: -dir.y, y: dir.x }
  const circle = Array.from({ length: 36 }, (_, i) => {
    const t = (i / 36) * Math.PI * 2
    return { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }
  })
  out.push({ kind: 'polygon', points: circle, stroke: INK, weight: W_DIM, tag: 'frame' })
  const tip = { x: c.x + dir.x * r * 0.9, y: c.y + dir.y * r * 0.9 }
  const tail = { x: c.x - dir.x * r * 0.6, y: c.y - dir.y * r * 0.6 }
  out.push({
    kind: 'polygon',
    points: [tip, { x: tail.x + side.x * r * 0.38, y: tail.y + side.y * r * 0.38 }, c, { x: tail.x - side.x * r * 0.38, y: tail.y - side.y * r * 0.38 }],
    fill: INK,
    stroke: INK,
    weight: W_DIM,
    tag: 'north-arrow',
  })
  const letter = { x: c.x + dir.x * (r + 2.6), y: c.y + dir.y * (r + 2.6) + 1.1 }
  out.push({ kind: 'text', at: letter, text: tr('North').slice(0, 1).toUpperCase(), size: 7, bold: true, anchor: 'middle', color: INK, tag: 'north-arrow' })
}

// ------------------------------------------------------------------ entry points

export function sheetLevels(project: Project, levelIds?: readonly string[]): Level[] {
  if (levelIds && levelIds.length > 0) return project.levels.filter((level) => levelIds.includes(level.id))
  const withWalls = project.levels.filter((level) => level.walls.length > 0)
  if (withWalls.length > 0) return withWalls
  return project.levels.slice(0, 1)
}

export function layoutPlanSheet(project: Project, level: Level, options: PlanSheetOptions): Sheet {
  const language = options.language ?? 'en'
  const date = options.date ?? new Date().toISOString().slice(0, 10)
  const k = mmPerMetre(options.scale)
  const { orientation, fits } = chooseOrientation(level, options)
  const size = paperSize(options.paper, orientation)
  const area = drawingArea(options.paper, orientation)
  const measured = measure(level, k)
  const hasOuter = valid(buildingBox(level)) && structuralWalls(level).length > 0
  const left = hasOuter ? OUTER_DIM_ROOM : EDGE_ROOM
  const bottom = hasOuter ? OUTER_DIM_ROOM : EDGE_ROOM
  // Centre the drawing (including its outer dimensions) in the printable area.
  const x0 = area.x + (area.width - measured.width) / 2 + left
  const yBottom = area.y + area.height - (area.height - measured.height) / 2 - bottom
  const frame: Frame = {
    k,
    originX: x0 - measured.box.minX * k,
    originY: yBottom + measured.box.minY * k,
  }
  const ink = new Ink(frame)
  drawWalls(ink, level)
  for (const wall of level.walls) {
    for (const opening of level.openings) if (opening.wallId === wall.id) drawOpening(ink, wall, opening)
  }
  drawColumns(ink, level)
  drawItems(ink, level)
  drawRooms(ink, level, project, language)
  drawOuterDimensions(ink, level, project)
  drawUserDimensions(ink, level, project)
  drawStrip(ink.out, size.width, size.height, { project, level, scale: options.scale, paper: options.paper, orientation, language, date, k })
  return {
    levelId: level.id,
    levelName: level.name,
    paper: options.paper,
    orientation,
    scale: options.scale,
    width: size.width,
    height: size.height,
    mmPerMetre: k,
    fits,
    drawing: { width: measured.width, height: measured.height },
    available: { width: area.width, height: area.height },
    origin: { x: frame.originX, y: frame.originY },
    primitives: ink.out,
  }
}

export function layoutPlanSheets(project: Project, options: PlanSheetOptions): Sheet[] {
  return sheetLevels(project, options.levelIds).map((level) => layoutPlanSheet(project, level, options))
}
