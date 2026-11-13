import { add, normalize, perp, scale, sub } from '../../model/geometry'
import { detectRooms } from '../../model/rooms'
import type { Level, Project, Room, Vec2, Wall } from '../../model/types'
import { formatArea, formatLength } from '../../model/units'
import { openingInterval, pointAlongWall, wallDirection, wallPolygon } from '../../model/walls'
import { A3_LANDSCAPE, encodePdf, PdfPage } from './pdf'

const PAPER = [0.957, 0.941, 0.902] as const
const INK = [0.17, 0.16, 0.15] as const
const ROOM = [0.9, 0.84, 0.72] as const

function asciiArea(squareMetres: number, units: Project['units']): string {
  return formatArea(squareMetres, units).replace('²', '2')
}

function isOuter(wall: Wall, rooms: readonly Room[]): boolean {
  if (rooms.length === 0) return true
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const dir = wallDirection(wall)
  const n = perp(dir)
  const left = add(mid, scale(n, wall.thickness + 0.25))
  const right = add(mid, scale(n, -(wall.thickness + 0.25)))
  const leftIn = rooms.some((room) => inside(left, room.polygon))
  const rightIn = rooms.some((room) => inside(right, room.polygon))
  return leftIn !== rightIn || (!leftIn && !rightIn)
}

function inside(p: Vec2, poly: readonly Vec2[]): boolean {
  if (poly.length < 3) return false
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (!a || !b) continue
    const crosses = a.y > p.y !== b.y > p.y
    if (!crosses) continue
    const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (p.x < x) hit = !hit
  }
  return hit
}

function boundsOf(level: Level): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (p: Vec2) => {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  for (const wall of level.walls) {
    grow(wall.a)
    grow(wall.b)
  }
  if (!Number.isFinite(minX)) return { minX: -4, minY: -4, maxX: 4, maxY: 4 }
  return { minX: minX - 1.4, minY: minY - 1.4, maxX: maxX + 1.4, maxY: maxY + 1.4 }
}

function drawPage(project: Project, level: Level, pageIndex: number, pageCount: number): PdfPage {
  const page = new PdfPage()
  const rooms = detectRooms(level)
  const total = rooms.reduce((sum, room) => sum + room.area, 0)
  const box = boundsOf(level)
  const margin = 36
  const titleH = 72
  const contentW = A3_LANDSCAPE.width - margin * 2
  const contentH = A3_LANDSCAPE.height - margin - titleH - 16
  const worldW = Math.max(0.5, box.maxX - box.minX)
  const worldH = Math.max(0.5, box.maxY - box.minY)
  const fit = Math.min(contentW / worldW, contentH / worldH)
  const originX = margin + (contentW - worldW * fit) / 2
  const originY = titleH + 16 + (contentH - worldH * fit) / 2
  const toX = (x: number) => originX + (x - box.minX) * fit
  const toY = (y: number) => originY + (y - box.minY) * fit

  page.setFill(...PAPER)
  page.rect(0, 0, page.width, page.height)
  page.fill()

  for (const room of rooms) {
    if (room.polygon.length < 3) continue
    page.setFill(...ROOM)
    const first = room.polygon[0]
    if (!first) continue
    page.moveTo(toX(first.x), toY(first.y))
    for (const p of room.polygon.slice(1)) page.lineTo(toX(p.x), toY(p.y))
    page.closePath()
    page.fill()
  }

  page.setFill(...INK)
  for (const wall of level.walls) {
    if (wall.kind === 'railing') continue
    const poly = wallPolygon(wall, level.walls)
    if (poly.length < 3) continue
    const first = poly[0]
    if (!first) continue
    page.moveTo(toX(first.x), toY(first.y))
    for (const p of poly.slice(1)) page.lineTo(toX(p.x), toY(p.y))
    page.closePath()
    page.fill()
  }

  page.setFill(...PAPER)
  for (const wall of level.walls) {
    for (const opening of level.openings) {
      if (opening.wallId !== wall.id) continue
      const span = openingInterval(wall, opening)
      const a = pointAlongWall(wall, span.start)
      const b = pointAlongWall(wall, span.end)
      const n = perp(wallDirection(wall))
      const half = wall.thickness / 2 + 0.01
      const gap = [add(a, scale(n, half)), add(b, scale(n, half)), add(b, scale(n, -half)), add(a, scale(n, -half))]
      const first = gap[0]
      if (!first) continue
      page.moveTo(toX(first.x), toY(first.y))
      for (const p of gap.slice(1)) page.lineTo(toX(p.x), toY(p.y))
      page.closePath()
      page.fill()
    }
  }

  page.setFill(0.23, 0.21, 0.18)
  for (const room of rooms) {
    page.text(toX(room.centroid.x) - 28, toY(room.centroid.y) + 4, 10, room.name)
    page.text(toX(room.centroid.x) - 28, toY(room.centroid.y) - 10, 8, asciiArea(room.area, project.units))
  }

  page.setStroke(0.25, 0.28, 0.27)
  page.setLineWidth(0.7)
  page.setFill(0.15, 0.22, 0.21)
  for (const wall of level.walls) {
    if (wall.kind === 'railing' || !isOuter(wall, rooms)) continue
    const delta = sub(wall.b, wall.a)
    const length = Math.hypot(delta.x, delta.y)
    if (length < 0.2) continue
    const dir = normalize(delta)
    let n = perp(dir)
    const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
    const probe = add(mid, scale(n, wall.thickness + 0.3))
    const probeIn = rooms.some((room) => inside(probe, room.polygon))
    if (probeIn) n = scale(n, -1)
    const offset = 0.7
    const p = add(wall.a, scale(n, offset))
    const q = add(wall.b, scale(n, offset))
    page.moveTo(toX(wall.a.x), toY(wall.a.y))
    page.lineTo(toX(p.x), toY(p.y))
    page.stroke()
    page.moveTo(toX(wall.b.x), toY(wall.b.y))
    page.lineTo(toX(q.x), toY(q.y))
    page.stroke()
    page.moveTo(toX(p.x), toY(p.y))
    page.lineTo(toX(q.x), toY(q.y))
    page.stroke()
    const label = formatLength(length, project.units)
    page.text((toX(p.x) + toX(q.x)) / 2, (toY(p.y) + toY(q.y)) / 2 + 4, 8, label)
  }

  const nice = [1, 2, 5, 10, 20, 50].find((step) => step * fit >= 70) ?? 10
  const bar = nice * fit
  const barX = margin
  const barY = titleH + 8
  page.setFill(...INK)
  page.rect(barX, barY, bar, 4)
  page.fill()
  page.text(barX, barY + 8, 9, `${nice} m`)

  page.setFill(0.12, 0.14, 0.16)
  page.rect(0, 0, page.width, titleH)
  page.fill()
  page.setFill(0.91, 0.72, 0.43)
  page.text(margin, 44, 16, project.name || 'Untitled')
  page.setFill(0.93, 0.91, 0.86)
  const date = new Date().toISOString().slice(0, 10)
  page.text(margin, 24, 11, `${level.name || 'Level'}  ·  ${date}  ·  ${asciiArea(total, project.units)}`)
  page.text(page.width - 160, 24, 11, `Page ${pageIndex + 1} of ${pageCount}`)
  return page
}

/** One A3 landscape page per level: walls, openings, names, outer dimensions, title block. */
export function buildPlanPdf(project: Project): string {
  const levels = project.levels.length > 0 ? project.levels : []
  if (levels.length === 0) {
    const page = new PdfPage()
    page.setFill(...PAPER)
    page.rect(0, 0, page.width, page.height)
    page.fill()
    page.setFill(...INK)
    page.text(48, 80, 16, project.name || 'Untitled')
    return encodePdf([page])
  }
  const pages = levels.map((level, index) => drawPage(project, level, index, levels.length))
  return encodePdf(pages)
}
